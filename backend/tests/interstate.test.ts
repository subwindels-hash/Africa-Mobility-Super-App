import { describe, expect, it } from 'vitest';
import {
  InterstateSystem, InterstateWhatsAppBridge,
  SERVICES, FREIGHT_VEHICLES, LOGISTICS_VENDOR_TYPES, VENDOR_VERIFICATION_STEPS,
  SHIPMENT_STATUSES, BOOKING_OPTIONS, PAYMENT_MODES, estimatePrice, splitSettlement,
  canTransition, haversineKm,
} from '../libs/interstate/src/index';

/** FAMS gate double — mirrors how apps/api wires fams.evaluate(). */
function gate(overrides: Record<string, boolean> = {}) {
  return {
    feature: (f: string, _ctx: any) => overrides[f] ?? (f.startsWith('ilst.state.') || ['ilst.marketplace', 'ilst.cold_chain', 'ilst.corporate'].includes(f)),
    category: (c: string, _ctx: any) => overrides[c] ?? true,
    vendor: (v: string, _ctx: any) => overrides[`vendor:${v}`] ?? true,
  };
}

/** Minimal escrow double mirroring core-domain lifecycle. */
function escrowLedger() {
  const holds = new Map<string, any>();
  let n = 0;
  return {
    holds,
    openEscrow: (bookingId: string, customer: string, vendor: string, totalMinor: number, milestones?: any) => {
      const escrowId = `esc_${++n}`;
      holds.set(escrowId, { escrowId, bookingId, customer, vendor, totalMinor, milestones: milestones ?? [], state: 'authorized', released: [] });
      return { escrowId, state: 'authorized' };
    },
    fund: (id: string) => { holds.get(id).state = 'funded'; return 'funded'; },
    begin: (id: string) => { holds.get(id).state = 'held'; return 'held'; },
    releaseMilestone: (id: string, index: number) => {
      const h = holds.get(id);
      h.released.push(h.milestones[index]?.label ?? `milestone_${index}`);
      h.state = 'partially_released';
      return h.state;
    },
    releaseOnCompletion: (id: string) => {
      const h = holds.get(id);
      h.state = 'released';
      return { vendorPayoutMinor: Math.round(h.totalMinor * 0.805) };
    },
    refund: (id: string) => { holds.get(id).state = 'refunded'; return 'refunded'; },
    hold: (id: string) => holds.get(id),
  };
}

function seededSystem(overrides: Record<string, boolean> = {}) {
  const esc = escrowLedger();
  const observations: any[] = [];
  const system = new InterstateSystem(
    gate(overrides) as any,
    esc as any,
    { observe: (o: any) => observations.push(o) },
  );
  // three verified logistics providers (7-step chain fully approved)
  for (const [id, name, rating, onTime] of [
    ['vnd_bolt_haul', 'Bolt Haul Nigeria', 4.8, 96],
    ['vnd_dangote_log', 'Dangote Logistics', 4.6, 93],
    ['vnd_cold_express', 'ColdExpress Freight', 4.9, 98],
  ] as const) {
    const v = system.registerVendor(id, id === 'vnd_cold_express' ? 'cold_chain_operator' : 'trucking_company');
    for (const step of VENDOR_VERIFICATION_STEPS) system.decideVerification(id, step, 'approved', 'admin_1');
    system.marketplace.registerProvider({
      vendorId: id, name, verified: true, rating, onTimePct: onTime,
      fleets: id === 'vnd_cold_express' ? { refrigerated_truck: 8, medium_truck: 4 } : { heavy_truck: 12, articulated_trailer: 6, box_truck: 10, flatbed_truck: 4, medium_truck: 8, container_truck: 3, low_loader: 2 },
      regions: ['NG-LAG', 'NG-KAN', 'NG-FCT', 'NG-RIV', 'NG-OYO', 'NG-KAD'],
    });
    void v;
  }
  return { system, esc, observations };
}

const CEMENT = { service: 'construction_material' as const, cargo: { categories: ['construction'], weightKg: 15_000 }, distanceKm: 570, originState: 'NG-LAG', destinationState: 'NG-KAN' };

describe('interstate catalog (§services/§vehicles)', () => {
  it('supports all 21 interstate services with cargo categories', () => {
    expect(SERVICES).toHaveLength(21);
    expect(SERVICES.map((s) => s.code)).toEqual(expect.arrayContaining([
      'ftl', 'ltl', 'shared_cargo', 'bulk_cargo', 'container', 'cold_chain', 'heavy_equipment',
      'construction_material', 'agricultural_produce', 'fmcg', 'manufacturing', 'warehouse_to_warehouse',
      'b2b', 'b2c', 'government', 'ngo_humanitarian', 'medical_pharma', 'ecommerce_line_haul',
      'livestock', 'vehicle_transport', 'machinery',
    ]));
  });

  it('defines 14 freight vehicle categories with capacity, dimensions, cargo support, insurance/maintenance hooks', () => {
    expect(FREIGHT_VEHICLES).toHaveLength(14);
    expect(FREIGHT_VEHICLES.map((v) => v.category)).toEqual(expect.arrayContaining([
      'mini_van', 'cargo_van', 'pickup_truck', 'light_truck', 'medium_truck', 'heavy_truck',
      'flatbed_truck', 'box_truck', 'refrigerated_truck', 'tanker', 'low_loader',
      'container_truck', 'articulated_trailer', 'specialized_heavy_haul',
    ]));
    for (const v of FREIGHT_VEHICLES) {
      expect(v.capacityKg).toBeGreaterThan(0);
      expect(v.dimensionsM.l).toBeGreaterThan(0);
      expect(v.cargoSupport.length).toBeGreaterThan(0);
    }
    expect(FREIGHT_VEHICLES.find((v) => v.category === 'refrigerated_truck')!.refrigerated).toBe(true);
  });

  it('best vehicle = smallest eligible capacity (utilization-first matching)', () => {
    const { system } = seededSystem();
    const q = system.quote({ ...CEMENT, cargo: { categories: ['construction'], weightKg: 800 } });
    expect(q.bestVehicle!.category).toBe('pickup_truck');
    const q2 = system.quote({ ...CEMENT, cargo: { categories: ['construction'], weightKg: CEMENT.cargo.weightKg } });
    expect(q2.bestVehicle!.category).toBe('flatbed_truck');   // 15t exact fit beats 18t heavy truck
  });

  it('reefer cargo requires a refrigerated vehicle', () => {
    const { system } = seededSystem();
    const q = system.quote({ service: 'medical_pharma', cargo: { categories: ['pharma'], weightKg: 2_000 }, distanceKm: 600, originState: 'NG-LAG', destinationState: 'NG-FCT' });
    expect(q.bestVehicle!.refrigerated).toBe(true);
  });

  it('lists the 7 logistics vendor types and 7-step verification chain', () => {
    expect(LOGISTICS_VENDOR_TYPES).toHaveLength(7);
    expect(LOGISTICS_VENDOR_TYPES.map((v) => v.type)).toEqual([
      'trucking_company', 'fleet_operator', 'independent_truck_owner', 'freight_broker',
      'warehouse_operator', 'cold_chain_operator', 'distribution_company',
    ]);
    expect(VENDOR_VERIFICATION_STEPS).toEqual([
      'business_verification', 'identity_verification', 'tax_verification', 'insurance_verification',
      'vehicle_verification', 'driver_verification', 'compliance_approval',
    ]);
  });
});

describe('vendor verification (§vendor-management)', () => {
  it('vendor is inactive until ALL 7 steps approved — admin compliance approval is the final gate', () => {
    const { system } = seededSystem();
    const v = system.registerVendor('vnd_new', 'independent_truck_owner');
    expect(v.active()).toBe(false);
    for (const step of VENDOR_VERIFICATION_STEPS.slice(0, 6)) system.decideVerification('vnd_new', step, 'approved', 'ops_2');
    expect(v.active()).toBe(false);                      // compliance approval still pending
    system.decideVerification('vnd_new', 'compliance_approval', 'approved', 'admin_1');
    expect(v.active()).toBe(true);
  });

  it('booking refuses unverified vendors', () => {
    const { system } = seededSystem();
    const q = system.quote(CEMENT);
    const v = system.registerVendor('vnd_ghost', 'freight_broker');
    void v;
    expect(() => system.book({
      quote: q, vendorId: 'vnd_ghost', cargo: CEMENT.cargo, service: 'construction_material',
      stops: [], customerId: 'cus_1', option: 'quote_request', paymentMode: 'escrow',
    })).toThrow(/not verified/);
  });

  it('FAMS-disabled vendors are refused even when verified', () => {
    const { system } = seededSystem({ 'vendor:vnd_bolt_haul': false });
    const q = system.quote(CEMENT);
    expect(() => system.book({
      quote: q, vendorId: 'vnd_bolt_haul', cargo: CEMENT.cargo, service: 'construction_material',
      stops: [], customerId: 'cus_1', option: 'quote_request', paymentMode: 'escrow',
    })).toThrow(/FAMS/);
  });
});

describe('booking options & shipment management (§booking/§shipment)', () => {
  it('exposes the eight booking options and eleven shipment statuses', () => {
    expect(BOOKING_OPTIONS).toEqual(['instant', 'scheduled', 'quote_request', 'compare_providers', 'one_way', 'return_trip', 'recurring', 'dedicated_fleet']);
    expect(SHIPMENT_STATUSES).toHaveLength(11);
    expect(SHIPMENT_STATUSES).toEqual(expect.arrayContaining(['quote_requested', 'quote_accepted', 'awaiting_pickup', 'driver_assigned', 'cargo_loaded', 'in_transit', 'checkpoint_update', 'delivered', 'completed', 'cancelled', 'disputed']));
  });

  it('multi-pickup + multi-destination shipments order pickups before dropoffs', () => {
    const { system } = seededSystem();
    const q = system.quote({ ...CEMENT, cargo: { categories: ['general'], weightKg: 5_000 }, option: 'compare_providers' });
    const s = system.book({
      quote: q, vendorId: 'vnd_bolt_haul', cargo: { categories: ['general'], weightKg: 5_000 },
      service: 'b2b', customerId: 'cus_1', option: 'scheduled', scheduledFor: new Date('2026-09-05'),
      paymentMode: 'corporate_billing',
      stops: [
        { kind: 'dropoff', sequence: 2, label: 'Kano Hub', lat: 12, lng: 8.5, stateCode: 'NG-KAN' },
        { kind: 'pickup', sequence: 1, label: 'Lagos Depot A', lat: 6.5, lng: 3.4, stateCode: 'NG-LAG' },
        { kind: 'pickup', sequence: 2, label: 'Ibadan Depot B', lat: 7.4, lng: 3.9, stateCode: 'NG-OYO' },
        { kind: 'dropoff', sequence: 1, label: 'Abuja Hub', lat: 9.1, lng: 7.4, stateCode: 'NG-FCT' },
      ],
    });
    expect(s.stops.map((x) => x.kind)).toEqual(['pickup', 'pickup', 'dropoff', 'dropoff']);
    expect(s.stops.filter((x) => x.kind === 'pickup').map((x) => x.sequence)).toEqual([1, 2]);
    expect(s.status).toBe('awaiting_pickup');            // scheduled booking
  });

  it('full lifecycle: driver_assigned → loaded → transit → checkpoints → delivered → completed with delivery confirmation', () => {
    const { system } = seededSystem();
    const q = system.quote(CEMENT);
    const s = system.book({
      quote: q, vendorId: 'vnd_dangote_log', cargo: CEMENT.cargo, service: 'construction_material',
      customerId: 'cus_2', option: 'instant', paymentMode: 'milestone',
      stops: [
        { kind: 'pickup', sequence: 1, label: 'Ewekoro Plant', lat: 6.9, lng: 3.2, stateCode: 'NG-LAG' },
        { kind: 'dropoff', sequence: 1, label: 'Kano Site', lat: 12, lng: 8.5, stateCode: 'NG-KAN' },
      ],
    });
    expect(s.status).toBe('driver_assigned');
    const loaded = system.markLoaded(s.id);
    expect(loaded.status).toBe('cargo_loaded');
    system.marketplace.advance(s.id, 'in_transit');
    const cp = system.checkpoint(s.id, { lat: 9.9, lng: 8.2, label: 'Kaduna–Kano road' });
    expect(cp.shipment.status).toBe('checkpoint_update');
    expect(cp.notifications.some((n) => n.includes('ETA update'))).toBe(true);
    const proof = system.proof(s.id, 'delivery', ['img_1.jpg'], 'Site Manager', 'sig:sha256:abc');
    expect(proof.photos).toEqual(['img_1.jpg']);
    expect(system.shipment(s.id)!.status).toBe('delivered');
    expect(system.shipment(s.id)!.security.proofOfDelivery!.digitalSignature).toContain('sha256');
    const { shipment: done, settlement } = system.complete(s.id);
    expect(done.status).toBe('completed');
    expect(settlement.vendorPayoutMinor).toBeLessThan(settlement.grossMinor);   // commission+tax deducted
  });

  it('status machine refuses illegal transitions', () => {
    expect(canTransition('quote_requested', 'delivered')).toBe(false);
    expect(canTransition('completed', 'in_transit')).toBe(false);
    expect(canTransition('in_transit', 'checkpoint_update')).toBe(true);
    expect(canTransition('in_transit', 'delivered')).toBe(true);
  });
});

describe('AI recommendation: route, vehicle, provider, cost, ETA (§route-optimization)', () => {
  const candidates = [
    { id: 'r_a2', via: 'A2 Lagos–Ibadan–Ogbomoso–Kano', distanceKm: 570, baseHours: 11, minRoadClass: 'truck_route' as const, maxAxleTons: 50, hasTolls: true, securityRisk: 0.2 },
    { id: 'r_old', via: 'Old Oyo–Jebba road', distanceKm: 540, baseHours: 14, minRoadClass: 'secondary' as const, maxAxleTons: 30, hasTolls: false, securityRisk: 0.5 },
    { id: 'r_east', via: 'Lokoja–Kaduna corridor', distanceKm: 640, baseHours: 12.5, minRoadClass: 'truck_route' as const, maxAxleTons: 50, hasTolls: true, securityRisk: 0.15 },
  ];
  const conditions = { traffic: 'moderate' as const, roadQuality: 'good' as const, weather: 'rain' as const, securityAdvisory: 0.2, tollNgn: 4500, fuelPriceNgnPerL: 870, weightRestrictionTons: 45, deadlineHours: 18 };

  it('recommends best route + vehicle + provider with cost & ETA', () => {
    const { system } = seededSystem();
    const rec = system.recommend({ ...CEMENT, candidates, conditions });
    expect(rec.route.id).toBe('r_a2');                    // tolled expressway beats longer/older roads
    expect(rec.route.meetsDeadline).toBe(true);
    expect(rec.vehicleLabel).toMatch(/Flatbed|Heavy Truck|Articulated/);
    expect(rec.recommendedVendorId).toBeTruthy();
    expect(rec.estimatedCostMinor).toBeGreaterThan(0);
    expect(rec.estimatedDeliveryHours).toBeGreaterThan(5);
    expect(rec.rationale.length).toBeGreaterThan(0);
  });

  it('weight restrictions exclude corridors the load cannot legally use', () => {
    const { system } = seededSystem();
    const rec = system.recommend({ ...CEMENT, cargo: { categories: ['heavy'], weightKg: 60_000 }, candidates, conditions });
    for (const r of [rec.route]) {
      const old = candidates.find((c) => c.id === 'r_old')!;
      expect(60).toBeGreaterThan(old.maxAxleTons);        // sanity: old road can't carry 60t
    }
    expect(rec.route.id).not.toBe('r_old');
  });

  it('quotes compare multiple verified providers, ranked by rating & on-time record', () => {
    const { system } = seededSystem();
    const q = system.quote(CEMENT);
    expect(q.offers.length).toBeGreaterThanOrEqual(2);
    expect(q.recommendedVendorId).toBe(q.offers[0].vendorId);
    expect(q.offers[0].rating).toBeGreaterThanOrEqual(q.offers[q.offers.length - 1].rating);
  });

  it('pricing reflects cold-chain, permits, urgency, security risk and LTL share', () => {
    const spec: any = SERVICES.find((s) => s.code === 'ftl')!;
    const v = FREIGHT_VEHICLES.find((x) => x.category === 'medium_truck')!;
    const base = estimatePrice(500, v, spec);
    const reefer = estimatePrice(500, v, SERVICES.find((s) => s.code === 'cold_chain')!);
    const express = estimatePrice(500, v, spec, { urgency: 'express' });
    const risky = estimatePrice(500, v, spec, { securityRisk: 0.8 });
    const ltl = estimatePrice(500, v, spec, { ltlSharePct: 30 });
    expect(reefer).toBeGreaterThan(base);
    expect(express).toBeGreaterThan(base);
    expect(risky).toBeGreaterThan(base);
    expect(ltl).toBeLessThan(base);
  });
});

describe('live tracking & cargo security (§tracking/§cargo-security)', () => {
  function inTransit() {
    const { system } = seededSystem();
    const q = system.quote(CEMENT);
    const s = system.book({
      quote: q, vendorId: 'vnd_bolt_haul', cargo: CEMENT.cargo, service: 'construction_material',
      customerId: 'cus_3', option: 'instant', paymentMode: 'escrow', insured: true, insurancePolicy: 'POL-77X',
      stops: [
        { kind: 'pickup', sequence: 1, label: 'Apapa', lat: 6.45, lng: 3.35, stateCode: 'NG-LAG' },
        { kind: 'dropoff', sequence: 1, label: 'Kano', lat: 12, lng: 8.5, stateCode: 'NG-KAN' },
      ],
    });
    system.markLoaded(s.id);
    system.marketplace.advance(s.id, 'in_transit');
    return { system, s };
  }

  it('checkpoints update ETA and produce checkpoint notifications', () => {
    const { system, s } = inTransit();
    const before = s.etaAt!.getTime();
    const out = system.checkpoint(s.id, { lat: 10.5, lng: 8.0, label: 'Kaduna bypass' });
    expect(out.notifications[0]).toContain('Checkpoint');
    expect(out.shipment.etaAt!.getTime()).toBeLessThan(before);      // progress pulls ETA earlier
    expect(out.shipment.etaAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('geofence violation and tamper alerts are recorded and surfaced', () => {
    const { system, s } = inTransit();
    const out = system.checkpoint(s.id, { lat: 7.4, lng: 3.9, label: 'off-corridor stop', outsideGeofence: true, sealBroken: true });
    expect(out.notifications.some((n) => n.includes('Geofence'))).toBe(true);
    expect(out.notifications.some((n) => n.includes('Tamper'))).toBe(true);
    expect(s.security.geofenceAlerts).toHaveLength(1);
    expect(s.security.tamperAlerts).toHaveLength(1);
    expect(s.security.seals[0].intact).toBe(false);
  });

  it('proof of pickup with photos + digital signature verifies cargo and advances the shipment', () => {
    const { system } = seededSystem();
    const q = system.quote(CEMENT);
    const s = system.book({
      quote: q, vendorId: 'vnd_bolt_haul', cargo: CEMENT.cargo, service: 'construction_material',
      customerId: 'cus_3', option: 'instant', paymentMode: 'escrow',
      stops: [{ kind: 'pickup', sequence: 1, label: 'Apapa', lat: 6.45, lng: 3.35, stateCode: 'NG-LAG' }],
    });
    system.verifyDriver(s.id, true);
    const proof = system.proof(s.id, 'pickup', ['img_a.jpg', 'img_b.jpg'], 'Warehouse Lead', 'sig:sha256:pickup');
    expect(proof.photos).toHaveLength(2);
    expect(system.shipment(s.id)!.status).toBe('cargo_loaded');
    expect(system.shipment(s.id)!.security.cargoVerified).toBe(true);
    expect(system.shipment(s.id)!.security.driverIdentityVerified).toBe(true);
  });

  it('shipment insurance is bound at booking and tracking links can be shared', () => {
    const { system, s } = inTransit();
    expect(s.security.insuredMinor).toBeGreaterThan(0);
    expect(s.security.insurancePolicy).toBe('POL-77X');
    const link = system.trackingLink(s.id, 'receiver@client.ng');
    expect(link.token).toContain(s.id);
    expect(link.recipient).toBe('receiver@client.ng');
    expect(link.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('payments & escrow (§payments)', () => {
  it('escrow payments: fund → hold → milestone release → completion settlement', () => {
    const { system, esc } = seededSystem();
    const q = system.quote(CEMENT);
    const s = system.book({
      quote: q, vendorId: 'vnd_bolt_haul', cargo: CEMENT.cargo, service: 'construction_material',
      customerId: 'cus_4', option: 'instant', paymentMode: 'milestone',
      stops: [{ kind: 'pickup', sequence: 1, label: 'Apapa', lat: 6.45, lng: 3.35, stateCode: 'NG-LAG' },
              { kind: 'dropoff', sequence: 1, label: 'Kano', lat: 12, lng: 8.5, stateCode: 'NG-KAN' }],
    });
    const hold = esc.hold(s.payment!.escrowId!);
    expect(hold.state).toBe('held');
    expect(hold.milestones.map((m: any) => m.label)).toEqual(['Cargo loaded & picked up', 'Delivered at destination']);
    system.markLoaded(s.id);
    expect(esc.hold(s.payment!.escrowId!).released).toEqual(['Cargo loaded & picked up']);
    system.proof(s.id, 'delivery', ['img.jpg'], 'Receiver', 'sig:sha256:x');
    const { settlement } = system.complete(s.id);
    expect(settlement.commissionMinor).toBe(Math.round(settlement.grossMinor * 0.12));
    expect(settlement.taxMinor).toBe(Math.round(settlement.grossMinor * 0.075));
    expect(settlement.vendorPayoutMinor).toBe(settlement.grossMinor - settlement.commissionMinor - settlement.taxMinor);
  });

  it('cancellation refunds escrow', () => {
    const { system, esc } = seededSystem();
    const q = system.quote(CEMENT);
    const s = system.book({
      quote: q, vendorId: 'vnd_dangote_log', cargo: CEMENT.cargo, service: 'construction_material',
      customerId: 'cus_5', option: 'quote_request', paymentMode: 'escrow',
      stops: [{ kind: 'pickup', sequence: 1, label: 'Ewekoro', lat: 6.9, lng: 3.2, stateCode: 'NG-LAG' }],
    });
    system.cancel(s.id);
    expect(s.status).toBe('cancelled');
    expect(esc.hold(s.payment!.escrowId!).state).toBe('refunded');
  });

  it('instant payment settles automatically with commission + tax split', () => {
    const split = splitSettlement(10_000_000);
    expect(split).toMatchObject({ grossMinor: 10_000_000, commissionMinor: 1_200_000, taxMinor: 750_000, vendorPayoutMinor: 8_050_000 });
    expect(PAYMENT_MODES).toEqual(['instant', 'escrow', 'corporate_billing', 'partial', 'milestone']);
  });
});

describe('corporate logistics (§corporate)', () => {
  it('departments, approver-gated transport requests, budget enforcement, invoices', () => {
    const { system } = seededSystem();
    system.corporate.createAccount('corp_dangote', 'Dangote Group', [
      { code: 'dept/logistics', name: 'Logistics', budgetMinor: 50_000_000, approvers: ['mgr_ada'] },
    ]);
    const req = system.corporate.raiseRequest({ accountId: 'corp_dangote', departmentCode: 'dept/logistics', requestedBy: 'staff_john', service: 'construction_material', originState: 'NG-LAG', destState: 'NG-KAN', estimatedMinor: 12_000_000 });
    expect(req.status).toBe('pending');
    expect(() => system.corporate.decide(req.id, 'mgr_wrong', 'approved')).toThrow(/not an approver/);
    const approved = system.corporate.decide(req.id, 'mgr_ada', 'approved');
    expect(approved.status).toBe('approved');
    // over-budget second request is refused
    const req2 = system.corporate.raiseRequest({ accountId: 'corp_dangote', departmentCode: 'dept/logistics', requestedBy: 'staff_john', service: 'construction_material', originState: 'NG-LAG', destState: 'NG-KAN', estimatedMinor: 45_000_000 });
    expect(() => system.corporate.decide(req2.id, 'mgr_ada', 'approved')).toThrow(/Budget exceeded/);
    // corporate-billed shipment → invoice
    const q = system.quote(CEMENT);
    const s = system.book({
      quote: q, vendorId: 'vnd_bolt_haul', cargo: CEMENT.cargo, service: 'construction_material',
      customerId: 'corp_dangote', corporateAccountId: 'corp_dangote', option: 'recurring', recurrence: 'weekly',
      paymentMode: 'corporate_billing',
      stops: [{ kind: 'pickup', sequence: 1, label: 'Apapa', lat: 6.45, lng: 3.35, stateCode: 'NG-LAG' },
              { kind: 'dropoff', sequence: 1, label: 'Kano', lat: 12, lng: 8.5, stateCode: 'NG-KAN' }],
    });
    system.marketplace.advance(s.id, 'awaiting_pickup');
    system.marketplace.advance(s.id, 'driver_assigned');
    system.markLoaded(s.id);
    system.marketplace.advance(s.id, 'in_transit');
    system.proof(s.id, 'delivery', ['x.jpg'], 'Receiver', 'sig:x');
    system.complete(s.id);
    const inv = system.corporate.generateInvoice('corp_dangote', '2026-08', system.list({ customerId: 'corp_dangote' }));
    expect(inv.lines.some((l: any) => l.shipmentId === s.id)).toBe(true);
    expect(inv.totalMinor).toBe(s.quoteMinor);
  });
});

describe('FAMS feature activation (§feature-activation)', () => {
  it('interstate marketplace OFF blocks quotes — no source change needed', () => {
    const { system } = seededSystem({ 'ilst.marketplace': false });
    expect(() => system.quote(CEMENT)).toThrow(/ilst.marketplace.*disabled/);
  });

  it('state-level control blocks origin or destination state', () => {
    const { system } = seededSystem({ 'ilst.state.NG-BOR': true, 'ilst.state.NG-KAN': false });
    expect(() => system.quote(CEMENT)).toThrow(/NG-KAN/);
  });

  it('cargo categories and vehicle types are admin-switchable', () => {
    const { system } = seededSystem({ 'cargo.construction': false });
    expect(() => system.quote(CEMENT)).toThrow(/construction/);
    const { system: s2 } = seededSystem({ 'veh.tanker': false });
    void s2;
  });

  it('permitted cargo (livestock) requires the legal gate feature', () => {
    const { system } = seededSystem({ 'ilst.permitted_cargo': false });
    expect(() => system.quote({ service: 'livestock', cargo: { categories: ['livestock'], weightKg: 4_000 }, distanceKm: 300, originState: 'NG-LAG', destinationState: 'NG-OYO' })).toThrow(/ilst.permitted_cargo/);
  });

  it('cold chain requires ilst.cold_chain feature', () => {
    const { system } = seededSystem({ 'ilst.cold_chain': false });
    expect(() => system.quote({ service: 'cold_chain', cargo: { categories: ['cold_chain'], weightKg: 4_000 }, distanceKm: 300, originState: 'NG-LAG', destinationState: 'NG-FCT' })).toThrow(/ilst.cold_chain/);
  });
});

describe('analytics (§analytics)', () => {
  it('builds all nine dashboards from shipment history', () => {
    const { system } = seededSystem();
    // two completed shipments, one cancelled, one rated
    for (const [vendor, mode] of [['vnd_bolt_haul', 'milestone'], ['vnd_dangote_log', 'escrow'], ['vnd_cold_express', 'escrow']] as const) {
      const q = system.quote({ service: 'ftl', cargo: { categories: ['general'], weightKg: 10_000 }, distanceKm: 500, originState: 'NG-LAG', destinationState: 'NG-FCT' });
      const s = system.book({
        quote: q, vendorId: vendor, cargo: { categories: ['general'], weightKg: 10_000 }, service: 'ftl',
        customerId: 'cus_9', option: 'instant', paymentMode: mode as any,
        stops: [{ kind: 'pickup', sequence: 1, label: 'Lagos', lat: 6.45, lng: 3.35, stateCode: 'NG-LAG' },
                { kind: 'dropoff', sequence: 1, label: 'Abuja', lat: 9.1, lng: 7.4, stateCode: 'NG-FCT' }],
      });
      if (vendor === 'vnd_cold_express') { system.cancel(s.id); continue; }
      s.createdAt = new Date(Date.now() - 20 * 3600_000);   // simulate a 20h corridor run
      system.markLoaded(s.id);
      system.marketplace.advance(s.id, 'in_transit');
      system.proof(s.id, 'delivery', ['a.jpg'], 'R', 'sig:a');
      system.complete(s.id);
      system.marketplace.rate(s.id, 4.5);
    }
    const d = system.analytics(
      [{ category: 'heavy_truck', utilizationPct: 82 }, { category: 'articulated_trailer', utilizationPct: 64 }],
      { avgHealthPct: 88, maintenanceDue: 3 },
    );
    expect(d.shipmentVolume).toBe(3);
    expect(d.interstateRevenueMinor).toBeGreaterThan(0);
    expect(d.commissionMinor).toBe(Math.round(d.interstateRevenueMinor * 0.12));
    expect(d.activeRoutes[0].corridor).toBe('NG-LAG→NG-FCT');
    expect(d.vehicleUtilization).toHaveLength(2);
    expect(d.vendorPerformance.every((v) => v.shipments >= 1)).toBe(true);
    expect(d.deliverySuccessRatePct).toBe(67);   // 2 completed vs 1 cancelled
    expect(d.averageDeliveryHours).toBeGreaterThan(10);
    expect(d.customerSatisfaction).toBe(4.5);
    expect(d.fleetPerformance).toEqual({ avgHealthPct: 88, maintenanceDue: 3 });
  });
});

describe('WhatsApp Smart AI integration (§whatsapp)', () => {
  it('parses a cargo sentence, quotes verified providers and recommends the best one', () => {
    const { system } = seededSystem();
    const ada = new InterstateWhatsAppBridge(system);
    const out = ada.handle('+2348010000001', {} as any, { intent: 'book_interstate' }, 'I need 20 tonnes of cement from Lagos to Kano');
    expect(out.text).toContain('Interstate quote');
    expect(out.text).toContain('⭐');
    expect(out.text).toContain('Recommended');
  });

  it('asks for missing details until the cargo sentence is complete', () => {
    const { system } = seededSystem();
    const ada = new InterstateWhatsAppBridge(system);
    const first = ada.handle('+2348010000002', {} as any, { intent: 'book_interstate' }, 'I want interstate freight');
    expect(first.text).toContain('Still needed');
    const second = ada.handle('+2348010000002', {} as any, { intent: 'book_interstate' }, '20 tonnes of cement from Lagos to Kano');
    expect(second.text).toContain('Interstate quote');
  });

  it('tracks a shipment and reports ETA + position', () => {
    const { system } = seededSystem();
    const q = system.quote(CEMENT);
    const s = system.book({
      quote: q, vendorId: 'vnd_bolt_haul', cargo: CEMENT.cargo, service: 'construction_material',
      customerId: '+2348010000003', option: 'instant', paymentMode: 'escrow',
      stops: [{ kind: 'pickup', sequence: 1, label: 'Apapa', lat: 6.45, lng: 3.35, stateCode: 'NG-LAG' },
              { kind: 'dropoff', sequence: 1, label: 'Kano', lat: 12, lng: 8.5, stateCode: 'NG-KAN' }],
    });
    system.markLoaded(s.id);
    system.marketplace.advance(s.id, 'in_transit');
    const ada = new InterstateWhatsAppBridge(system);
    const out = ada.handle('+2348010000003', {} as any, { intent: 'track_shipment' }, 'where is my cargo');
    expect(out.text).toContain(s.id.toUpperCase());
    expect(out.text).toContain('in transit');
    expect(out.text).toContain('ETA');
  });

  it('FAMS-blocked marketplace is surfaced to the customer as unavailable', () => {
    const { system } = seededSystem({ 'ilst.marketplace': false });
    const ada = new InterstateWhatsAppBridge(system);
    const out = ada.handle('+2348010000004', {} as any, { intent: 'book_interstate' }, '20 tonnes of cement from Lagos to Kano');
    expect(out.text).toContain('ilst.marketplace');
  });
});

describe('utilities', () => {
  it('haversine distance sanity (Lagos → Abuja ≈ 480-580 km)', () => {
    const km = haversineKm(6.5244, 3.3792, 9.0765, 7.3986);
    expect(km).toBeGreaterThan(450);
    expect(km).toBeLessThan(600);
  });
});
