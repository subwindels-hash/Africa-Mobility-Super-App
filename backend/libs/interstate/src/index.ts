/**
 * Interstate Logistics & Long-Distance Freight — system orchestrator
 * (docs/32). Integrates (never standalone):
 *   FAMS          — ilst.* features, cargo/vehicle/route categories, states, vendors
 *   Wallet/Escrow — core domain escrow (fund → hold → milestones → settlement)
 *   SHIELD        — not wired here; tracking security flows via the API layer
 *   ORGANISM      — freight observations feed the intelligence graph
 *   WhatsApp Ada  — InterstateBridge (quotes, photos, locations, tracking, ETA)
 *   Mobility      — truck telemetry/geo classes reused by the API layer
 *
 * Future expansion is structurally ready (docs/32 §future): cross-border,
 * customs documentation, import/export, freight forwarding, air/marine/rail
 * cargo, multi-modal, predictive supply chain — all behind FAMS gates.
 */
import {
  SERVICES, FREIGHT_VEHICLES, LOGISTICS_VENDOR_TYPES, VENDOR_VERIFICATION_STEPS,
  createVendorVerification, decideStep, bestVehicle,
  type InterstateService, type LogisticsVendorType, type VerificationStep, type VendorVerification,
} from './catalog';
import {
  InterstateMarketplace, splitSettlement, estimatePrice, haversineKm,
  SHIPMENT_STATUSES, BOOKING_OPTIONS, PAYMENT_MODES, canTransition,
  type Shipment, type ShipmentStatus, type BookingOption, type PaymentMode,
  type QuoteRequest, type QuoteResult, type ShipmentStop, type ProviderOffer, type SettlementSplit,
} from './shipments';
import { InterstateRouter, buildDashboards, recommendShipments, type AnalyticsDashboards, type RouteCandidate, type CorridorConditions } from './intelligence';
import { CorporateLogistics } from './corporate';

export interface FamsInterstateGate {
  /** Feature gate — ilst.marketplace, ilst.cold_chain, ilst.corporate, ilst.cross_border… */
  feature(feature: string, ctx: Record<string, unknown>): boolean;
  /** Category gate — cargo.<category>, veh.<category>, route.<CORRIDOR>. */
  category(code: string, ctx: Record<string, unknown>): boolean;
  /** Vendor gate — verified vendor active on the platform. */
  vendor(vendorId: string, ctx: Record<string, unknown>): boolean;
}

export interface EscrowBridge {
  openEscrow(bookingId: string, customer: string, vendor: string, totalMinor: number, milestones?: { label: string; pct: number }[]): { escrowId: string; state: string };
  fund(escrowId: string): string;
  begin(escrowId: string): string;
  releaseMilestone(escrowId: string, index: number): string;
  releaseOnCompletion(escrowId: string): { vendorPayoutMinor: number };
  refund(escrowId: string): string;
  hold(id: string): unknown;
}

export interface OrganismInterstateBridge {
  observe(o: { layer: string; subSwarm: string; node: string; signal: string; direction: 'up' | 'down' | 'flat'; confidence: number }): void;
}

export * from './catalog';
export * from './shipments';
export * from './intelligence';
export * from './corporate';

// ── the system ──────────────────────────────────────────────────────────────

export interface InterstateQuoteInput {
  service: InterstateService;
  cargo: { categories: string[]; weightKg: number; volumeM3?: number; declaredValueMinor?: number };
  distanceKm: number;
  originState: string;             // NG-LAG
  destinationState: string;        // NG-KAN
  option?: BookingOption;
  urgency?: 'standard' | 'express';
  routeSecurityRisk?: number;
}

export class InterstateSystem {
  readonly marketplace = new InterstateMarketplace();
  readonly router = new InterstateRouter();
  readonly corporate = new CorporateLogistics();
  private verifications = new Map<string, VendorVerification>();
  private escrowHolds = new Map<string, any>();

  constructor(
    private famsGate?: FamsInterstateGate,
    private escrow?: EscrowBridge,
    private organism?: OrganismInterstateBridge,
  ) {}

  // ── § vendor management ──────────────────────────────────────────────────
  registerVendor(vendorId: string, type: LogisticsVendorType): VendorVerification {
    const v = createVendorVerification(vendorId, type);
    this.verifications.set(vendorId, v);
    return v;
  }

  decideVerification(vendorId: string, step: VerificationStep, status: 'approved' | 'rejected', by: string): VendorVerification {
    const v = this.verifications.get(vendorId);
    if (!v) throw new Error(`Vendor ${vendorId} not registered`);
    return decideStep(v, step, status, by);
  }

  verification(vendorId: string): VendorVerification | undefined { return this.verifications.get(vendorId); }
  get vendorTypes() { return LOGISTICS_VENDOR_TYPES; }
  get verificationSteps() { return VENDOR_VERIFICATION_STEPS; }

  /** Marketplace listing — verified AND FAMS-active vendors only. */
  activeVendors(ctx: Record<string, unknown> = {}): VendorVerification[] {
    return [...this.verifications.values()].filter((v) =>
      v.active() && (!this.famsGate || this.famsGate.vendor(v.vendorId, ctx)));
  }

  // ── § booking: quotes with provider comparison ───────────────────────────
  quote(input: InterstateQuoteInput, ctx: Record<string, unknown> = {}): QuoteResult {
    const spec = SERVICES.find((s) => s.code === input.service)!;
    // FAMS: marketplace + service + cargo categories + origin/destination states
    this.assertFeature('ilst.marketplace', ctx);
    if (this.famsGate && !this.famsGate.category(`svc.ilst.${input.service}`, ctx)) {
      throw new Error(`Service ${input.service} is not activated (FAMS)`);
    }
    for (const cat of spec.cargoCategories) {
      if (this.famsGate && !this.famsGate.category(`cargo.${cat}`, ctx)) throw new Error(`Cargo category ${cat} disabled (FAMS)`);
    }
    if (this.famsGate && !this.famsGate.feature(`ilst.state.${input.originState}`, ctx)) throw new Error(`Interstate logistics disabled in ${input.originState} (FAMS)`);
    if (this.famsGate && !this.famsGate.feature(`ilst.state.${input.destinationState}`, ctx)) throw new Error(`Interstate logistics disabled in ${input.destinationState} (FAMS)`);
    if (spec.requiresReefer) this.assertFeature('ilst.cold_chain', ctx);
    if (spec.riskClass === 'permitted') this.assertFeature('ilst.permitted_cargo', ctx);
    void bestVehicle;
    return this.marketplace.requestQuote({
      service: input.service,
      cargo: { categories: input.cargo.categories, weightKg: input.cargo.weightKg, volumeM3: input.cargo.volumeM3, declaredValueMinor: input.cargo.declaredValueMinor },
      distanceKm: input.distanceKm,
      routeSecurityRisk: input.routeSecurityRisk,
      option: input.option ?? 'quote_request',
      urgency: input.urgency,
    }, { originState: input.originState });
  }

  /** § AI recommendation bundle (route + vehicle + provider + cost + ETA). */
  recommend(input: InterstateQuoteInput & { candidates: RouteCandidate[]; conditions: CorridorConditions }, ctx: Record<string, unknown> = {}): ReturnType<typeof recommendShipments> & { quote: QuoteResult } {
    const q = this.quote(input, ctx);
    const route = `route.${input.originState}-${input.destinationState}`;
    if (input.candidates.length && !(this.famsGate?.category(route, ctx) ?? true)) {
      throw new Error(`Route ${route} disabled by administrator (FAMS)`);
    }
    const rec = recommendShipments(this.router, { ...input, option: input.option ?? 'quote_request' }, q.offers, input.service);
    this.organism?.observe({ layer: 'data_analysis', subSwarm: 'logistics_core', node: `corridor:${input.originState}-${input.destinationState}`, signal: 'quote_requested', direction: 'flat', confidence: 0.8 });
    return { ...rec, quote: q };
  }

  // ── § booking + payments ─────────────────────────────────────────────────
  book(p: {
    quote: QuoteResult; vendorId: string; cargo: InterstateQuoteInput['cargo']; service: InterstateService;
    stops: ShipmentStop[]; customerId: string; corporateAccountId?: string; option: BookingOption;
    scheduledFor?: Date; recurrence?: 'weekly' | 'monthly'; plate?: string;
    paymentMode: PaymentMode; insured?: boolean; insurancePolicy?: string;
  }, ctx: Record<string, unknown> = {}): Shipment {
    this.assertFeature('ilst.marketplace', ctx);
    const vendor = this.verifications.get(p.vendorId);
    if (!vendor?.active()) throw new Error(`Vendor ${p.vendorId} is not verified+active — booking refused`);
    if (this.famsGate && !this.famsGate.vendor(p.vendorId, ctx)) throw new Error(`Vendor ${p.vendorId} disabled by administrator (FAMS)`);
    const shipment = this.marketplace.book({ ...p, party: { customerId: p.customerId, corporateAccountId: p.corporateAccountId } });

    // payments & escrow: customer pays platform → platform holds → payout
    if (p.paymentMode === 'escrow' || p.paymentMode === 'milestone') {
      const milestones = p.paymentMode === 'milestone'
        ? [{ label: 'Cargo loaded & picked up', pct: 40 }, { label: 'Delivered at destination', pct: 60 }]
        : undefined;
      const esc = this.escrow!.openEscrow(shipment.id, p.customerId, p.vendorId, shipment.quoteMinor!, milestones);
      this.escrowHolds.set(esc.escrowId, esc);
      shipment.payment!.escrowId = esc.escrowId;
      this.escrow!.fund(esc.escrowId);
      this.escrow!.begin(esc.escrowId);
    } else if (p.paymentMode === 'instant') {
      const split = splitSettlement(shipment.quoteMinor!);
      shipment.payment!.settledMinor = split.vendorPayoutMinor;
    } // corporate_billing → invoice; partial → escrow with milestones
    this.organism?.observe({ layer: 'data_analysis', subSwarm: 'logistics_core', node: `vendor:${p.vendorId}`, signal: 'shipment_booked', direction: 'up', confidence: 0.9 });
    return shipment;
  }

  shipment(id: string): Shipment | undefined { return this.marketplace.getShipment(id); }
  list(filter?: Parameters<InterstateMarketplace['listShipments']>[0]): Shipment[] { return this.marketplace.listShipments(filter); }

  /** Cargo loaded → release milestone 1 (40%) for milestone payments. */
  markLoaded(id: string): Shipment {
    const s = this.marketplace.advance(id, 'cargo_loaded');
    if (s.payment?.mode === 'milestone' && s.payment.escrowId) this.escrow?.releaseMilestone(s.payment.escrowId, 0);
    return s;
  }

  /** Delivered + confirmed → completion release (commission+tax deducted, vendor auto-payout). */
  complete(id: string): { shipment: Shipment; settlement: SettlementSplit } {
    const s = this.marketplace.getShipment(id)!;
    if (s.status === 'delivered') this.marketplace.advance(id, 'completed');
    const split = splitSettlement(s.quoteMinor!);
    if (s.payment?.mode === 'milestone' && s.payment.escrowId) this.escrow?.releaseMilestone(s.payment.escrowId, 1);
    else if (s.payment?.escrowId) this.escrow!.releaseOnCompletion(s.payment.escrowId);
    const done = this.marketplace.settle(id, split);
    this.organism?.observe({ layer: 'data_analysis', subSwarm: 'logistics_core', node: 'interstate_settlement', signal: 'completed', direction: 'up', confidence: 0.95 });
    return { shipment: done, settlement: split };
  }

  cancel(id: string): Shipment {
    const s = this.marketplace.getShipment(id)!;
    if (s.payment?.escrowId) this.escrow?.refund(s.payment.escrowId);   // refund management
    return this.marketplace.advance(id, 'cancelled');
  }

  // ── § live tracking (delegated to marketplace; telemetry → mobility) ─────
  checkpoint(id: string, c: { lat: number; lng: number; label: string; note?: string; outsideGeofence?: boolean; sealBroken?: boolean }) {
    const out = this.marketplace.checkpoint(id, c);
    if (out.notifications.some((n) => n.includes('Tamper') || n.includes('Geofence'))) {
      this.organism?.observe({ layer: 'data_analysis', subSwarm: 'logistics_core', node: `shipment:${id}`, signal: 'security_alert', direction: 'down', confidence: 0.9 });
    }
    return out;
  }

  verifyDriver(id: string, ok = true): Shipment { return this.marketplace.verifyDriver(id, ok); }

  proof(id: string, type: 'pickup' | 'delivery', photos: string[], signedBy: string, signature: string) {
    return this.marketplace.attachProof(id, type, { photos, signedBy, signature });
  }

  trackingLink(id: string, recipient: string, ttlHours = 72) { return this.marketplace.shareTrackingLink(id, recipient, ttlHours); }

  // ── § analytics ──────────────────────────────────────────────────────────
  analytics(vehicleUtilization: { category: string; utilizationPct: number }[], fleet: { avgHealthPct: number; maintenanceDue: number }): AnalyticsDashboards {
    return buildDashboards(this.list(), vehicleUtilization, fleet);
  }

  catalog() {
    return { services: SERVICES, vehicles: FREIGHT_VEHICLES, vendorTypes: LOGISTICS_VENDOR_TYPES, verificationSteps: VENDOR_VERIFICATION_STEPS, statuses: SHIPMENT_STATUSES, bookingOptions: BOOKING_OPTIONS, paymentModes: PAYMENT_MODES };
  }

  private assertFeature(feature: string, ctx: Record<string, unknown>): void {
    if (this.famsGate && !this.famsGate.feature(feature, ctx)) {
      throw new Error(`${feature} is disabled by administrator (FAMS)`);
    }
  }
}

// ── § WhatsApp Smart AI integration ─────────────────────────────────────────

export interface InterstateWaMessage { to: string; text: string; meta?: Record<string, unknown> }

/** Ada bridge: request shipping, quotes, cargo photos, pickup/delivery locations,
 *  tracking, ETA updates, AI assistance + automatic provider recommendation. */
export class InterstateWhatsAppBridge {
  private drafts = new Map<string, { service?: InterstateService; weightKg?: number; categories: string[]; photos: string[]; pickup?: ShipmentStop; dropoff?: ShipmentStop; lastQuote?: QuoteResult; lastShipmentId?: string }>();

  constructor(private system: InterstateSystem, private famsCtx: Record<string, unknown> = { country: 'NG', userGroups: ['customers'] }) {}

  handle(phone: string, _session: unknown, nlu: { intent: string }, rawText: string): InterstateWaMessage {
    const meta = { intent: nlu.intent, vertical: 'interstate' };
    const d = this.drafts.get(phone) ?? { categories: [], photos: [] };

    if (nlu.intent === 'track_shipment') {
      const id = this.drafts.get(phone)?.lastShipmentId ?? this.system.list()[0]?.id;
      const s = id ? this.system.shipment(id) : undefined;
      if (!s) return { to: phone, text: '🔍 No shipment found yet. Send cargo details like *"12 tonnes Lagos → Kano"* to book interstate freight.', meta };
      const eta = s.etaAt ? new Date(s.etaAt).toISOString().slice(0, 16).replace('T', ' ') : '—';
      const pos = s.currentLat !== undefined ? `${s.currentLat.toFixed(3)}, ${s.currentLng!.toFixed(3)}` : 'awaiting pickup';
      return { to: phone, text: `🚚 *Shipment ${s.id.toUpperCase()}*\n\n📦 ${s.spec.label}\n📍 Status: *${s.status.replace(/_/g, ' ')}*\n🗺 Position: ${pos}\n⏱ ETA: ${eta}\n\n🔗 I can share a tracking link with your recipient — reply *share tracking*.`, meta: { ...meta, shipmentId: s.id } };
    }

    // book_interstate — parse cargo sentence: "<weight> <unit> of <goods> from X to Y"
    const from = rawText.match(/from\s+([A-Za-z ]+?)(?:\s+to\s+|\s*→)/i);
    const to = rawText.match(/\bto\s+([A-Za-z ]+)/i);
    const tonnes = rawText.match(/([\d.]+)\s*(tonne|ton|tonnes|tons|kg|t)\b/i);
    const service = this.detectService(rawText);

    if (tonnes) {
      const unit = tonnes[2].toLowerCase();
      const kg = unit === 'kg' ? Number(tonnes[1]) : Number(tonnes[1]) * 1000;
      d.weightKg = kg;
      d.service = service;
      d.categories = [this.detectCategory(rawText)];
    } else if (service) {
      d.service = service;
    }
    if (rawText.match(/photo|picture|image/i) || d.photos.length) d.photos.push(`photo_${Date.now()}`);
    if (from) d.pickup = { kind: 'pickup', sequence: 1, label: from[1].trim(), lat: 6.5244, lng: 3.3792, stateCode: this.stateFor(from[1]) };
    if (to) d.dropoff = { kind: 'dropoff', sequence: 1, label: to[1].trim(), lat: 9.0765, lng: 7.3986, stateCode: this.stateFor(to[1]) };
    this.drafts.set(phone, d);

    if (d.service && d.weightKg && d.pickup && d.dropoff) {
      const distanceKm = Math.round(haversineKm(d.pickup.lat, d.pickup.lng, d.dropoff.lat, d.dropoff.lng));
      try {
        const quote = this.system.quote({
          service: d.service,
          cargo: { categories: d.categories, weightKg: d.weightKg },
          distanceKm,
          originState: d.pickup.stateCode,
          destinationState: d.dropoff.stateCode,
          option: 'quote_request',
        }, this.famsCtx);
        d.lastQuote = quote;
        const top = quote.offers.slice(0, 3).map((o: ProviderOffer, i: number) => `${i === 0 ? '⭐' : '  '} *${o.vendorName}* — ₦${(o.priceMinor / 100).toLocaleString()} · ${o.etaHours}h · ${o.vehicleCategory.replace(/_/g, ' ')}`).join('\n');
        return { to: phone, text: `🚚 *Interstate quote ${d.pickup.label} → ${d.dropoff.label}* (${distanceKm} km, ${d.weightKg >= 1000 ? `${d.weightKg / 1000}t` : `${d.weightKg}kg`})\n\n${top}\n\n💡 Recommended: *${quote.offers[0]?.vendorName ?? '—'}* (best rating & on-time record)\n${d.photos.length ? `📸 ${d.photos.length} cargo photo(s) attached to the request\n` : ''}Reply *book* to confirm with escrow protection, or *share tracking* later for live GPS.`, meta: { ...meta, quote: quote.estimate } };
      } catch (e: any) {
        return { to: phone, text: `⚠️ ${e.message}`, meta };
      }
    }

    const need = !d.service ? 'cargo type (e.g. *cold chain*, *cement*, *container*)' : !d.weightKg ? 'weight (e.g. *12 tonnes*)' : !d.pickup || !d.dropoff ? 'route (e.g. *from Lagos to Kano*)' : 'details';
    return { to: phone, text: `🚚 *Interstate freight desk*\n\nTell me your cargo — for example:\n*"20 tonnes of cement from Lagos to Kano"*\n*"cold chain pharma Port Harcourt to Abuja"*\n\nStill needed: ${need}.\nYou can also 📸 attach cargo photos and 📍 share location pins.`, meta };
  }

  private detectService(t: string): InterstateService | undefined {
    const x = t.toLowerCase();
    if (/cold chain|refrigerat|frozen|pharma|medical/.test(x)) return 'cold_chain';
    if (/container|40 ?feet|20 ?feet/.test(x)) return 'container';
    if (/livestock|cattle|goat|cow/.test(x)) return 'livestock';
    if (/heavy equipment|excavator|bulldozer|transformer/.test(x)) return 'heavy_equipment';
    if (/cement|iron rod|construction|granite|sand/.test(x)) return 'construction_material';
    if (/grain|produce|farm|maize|rice|tomato/.test(x)) return 'agricultural_produce';
    if (/full truck|ftl/.test(x)) return 'ftl';
    if (/shared|ltl|part load/.test(x)) return 'ltl';
    if (/truck|freight|cargo|haul/.test(x)) return 'ftl';
    return undefined;
  }

  private detectCategory(t: string): string {
    const x = t.toLowerCase();
    if (/cold chain|refrigerat|frozen|pharma|medical/.test(x)) return 'cold_chain';
    if (/cement|iron rod|construction|granite|sand/.test(x)) return 'construction';
    if (/container/.test(x)) return 'container';
    if (/grain|produce|farm|maize|rice|tomato/.test(x)) return 'agricultural';
    if (/livestock|cattle|cow|goat/.test(x)) return 'livestock';
    if (/machinery|equipment|excavator/.test(x)) return 'machinery';
    return 'general';
  }

  private stateFor(label: string): string {
    const l = label.toLowerCase();
    if (l.includes('lagos')) return 'NG-LAG';
    if (l.includes('abuja') || l.includes('fct')) return 'NG-FCT';
    if (l.includes('kano')) return 'NG-KAN';
    if (l.includes('port harcourt') || l.includes('rivers')) return 'NG-RIV';
    if (l.includes('ibadan') || l.includes('oyo')) return 'NG-OYO';
    if (l.includes('kaduna')) return 'NG-KAD';
    if (l.includes('borno') || l.includes('maiduguri')) return 'NG-BOR';
    return 'NG-LAG';
  }
}
