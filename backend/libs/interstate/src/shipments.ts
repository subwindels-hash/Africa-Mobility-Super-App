/**
 * Interstate shipment management (docs/32 §booking/§shipment/§tracking/
 * §cargo-security/§payments). Pure domain — persistence and gates live above.
 */
import {
  SERVICES, type InterstateService, type ServiceSpec, type CargoDescriptor,
  type FreightVehicleSpec, bestVehicle,
} from './catalog';

// ── § Shipment statuses (11) ────────────────────────────────────────────────

export type ShipmentStatus =
  | 'quote_requested' | 'quote_accepted' | 'awaiting_pickup' | 'driver_assigned'
  | 'cargo_loaded' | 'in_transit' | 'checkpoint_update' | 'delivered'
  | 'completed' | 'cancelled' | 'disputed';

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'quote_requested', 'quote_accepted', 'awaiting_pickup', 'driver_assigned',
  'cargo_loaded', 'in_transit', 'checkpoint_update', 'delivered',
  'completed', 'cancelled', 'disputed',
];

/** Legal status transitions — enforced by advance(); 'checkpoint_update' is a
 *  transient in_transit sub-state that settles back to in_transit. */
const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  quote_requested: ['quote_accepted', 'cancelled'],
  quote_accepted: ['awaiting_pickup', 'cancelled'],
  awaiting_pickup: ['driver_assigned', 'cancelled'],
  driver_assigned: ['cargo_loaded', 'cancelled', 'disputed'],
  cargo_loaded: ['in_transit', 'disputed'],
  in_transit: ['checkpoint_update', 'delivered', 'disputed'],
  checkpoint_update: ['in_transit', 'delivered', 'disputed'],
  delivered: ['completed', 'disputed'],
  completed: [],
  cancelled: [],
  disputed: ['completed', 'cancelled'],   // arbitration outcomes
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ── § Booking options ───────────────────────────────────────────────────────

export type BookingOption =
  | 'instant' | 'scheduled' | 'quote_request' | 'compare_providers'
  | 'one_way' | 'return_trip' | 'recurring' | 'dedicated_fleet';

export const BOOKING_OPTIONS: BookingOption[] = [
  'instant', 'scheduled', 'quote_request', 'compare_providers',
  'one_way', 'return_trip', 'recurring', 'dedicated_fleet',
];

export type StopKind = 'pickup' | 'dropoff';

export interface ShipmentStop {
  kind: StopKind;
  sequence: number;                  // multi-pickup / multi-destination order
  label: string;                     // "Dangote Depot, Lagos"
  lat: number;
  lng: number;
  stateCode: string;                 // NG-LAG (state-level FAMS gating)
  completedAt?: Date;
}

export interface ShipmentParty {
  customerId: string;
  corporateAccountId?: string;       // corporate logistics (docs/32 §corporate)
  vendorId?: string;                 // logistics provider
  driverId?: string;
  vehicleId?: string;
}

// ── § Cargo security ────────────────────────────────────────────────────────

export interface CargoSecurity {
  insuredMinor: number;              // shipment insurance
  insurancePolicy?: string;
  seals: { id: string; intact: boolean; installedAt: Date }[];
  tamperAlerts: { at: Date; sealId: string; detail: string }[];
  geofenceAlerts: { at: Date; detail: string }[];
  driverIdentityVerified: boolean;
  cargoVerified: boolean;
  proofOfPickup?: ProofDocument;
  proofOfDelivery?: ProofDocument;
}

export interface ProofDocument {
  type: 'pickup' | 'delivery';
  photos: string[];                  // media ids (WhatsApp photo confirmation too)
  digitalSignature?: string;         // signer name + hash
  signedBy?: string;
  at: Date;
}

// ── § Shipment record ───────────────────────────────────────────────────────

export interface Shipment {
  id: string;                        // shp_...
  service: InterstateService;
  spec: ServiceSpec;
  cargo: CargoDescriptor & { declaredValueMinor: number };
  weightKg: number;
  dimensionsM: { l: number; w: number; h: number };
  stops: ShipmentStop[];             // single/multi pickup + single/multi dropoff
  party: ShipmentParty;
  booking: { option: BookingOption; scheduledFor?: Date; recurrence?: 'weekly' | 'monthly'; compareQuotes?: boolean };
  status: ShipmentStatus;
  assignedVehicle?: FreightVehicleSpec & { plate: string; vendorId: string };
  etaAt?: Date;
  checkpoints: { at: Date; label: string; lat: number; lng: number; note?: string }[];
  currentLat?: number;
  currentLng?: number;
  security: CargoSecurity;
  quoteMinor?: number;
  payment?: { mode: PaymentMode; escrowId?: string; settledMinor?: number };
  rating?: { score: number; comment?: string };   // customer satisfaction
  createdAt: Date;
  updatedAt: Date;
}

// ── § Payments & escrow ─────────────────────────────────────────────────────

export type PaymentMode = 'instant' | 'escrow' | 'corporate_billing' | 'partial' | 'milestone';

export const PAYMENT_MODES: PaymentMode[] = ['instant', 'escrow', 'corporate_billing', 'partial', 'milestone'];

export interface SettlementSplit {
  grossMinor: number;
  commissionMinor: number;           // platform commission
  taxMinor: number;                  // VAT/withholding
  vendorPayoutMinor: number;         // automatic vendor settlement
}

/** Platform commission + tax deduction + automatic vendor payout (docs/32 §payments). */
export function splitSettlement(grossMinor: number, commissionPct = 12, taxPct = 7.5): SettlementSplit {
  const commissionMinor = Math.round(grossMinor * commissionPct / 100);
  const taxMinor = Math.round(grossMinor * taxPct / 100);
  return { grossMinor, commissionMinor, taxMinor, vendorPayoutMinor: grossMinor - commissionMinor - taxMinor };
}

// ── Marketplace: quotes + booking + tracking ────────────────────────────────

export interface ProviderOffer {
  vendorId: string;
  vendorName: string;
  rating: number;                    // 0..5 vendor performance
  onTimePct: number;                 // delivery success / avg delivery time inputs
  vehicleCategory: FreightVehicleSpec['category'];
  priceMinor: number;
  etaHours: number;
  reasons: string[];
}

export interface QuoteRequest {
  service: InterstateService;
  cargo: CargoDescriptor;
  distanceKm: number;
  routeSecurityRisk?: number;        // 0..1 security advisory factor
  option: BookingOption;
  urgency?: 'standard' | 'express';
  insured?: boolean;
}

export interface QuoteResult {
  shipmentId: string;
  offers: ProviderOffer[];           // compare multiple logistics providers
  recommendedVendorId?: string;
  bestVehicle?: FreightVehicleSpec;
  estimate: { priceMinor: number; etaHours: number };
  currency: 'NGN';
}

/** Base interstate tariff (minor units): distance × vehicle rate index × cargo multipliers. */
export function estimatePrice(distanceKm: number, vehicle: FreightVehicleSpec, spec: ServiceSpec, opts?: { urgency?: 'standard' | 'express'; securityRisk?: number; ltlSharePct?: number }): number {
  const BASE = 350_000;              // base charge (₦3,500)
  const PER_KM_INDEX = 2_400;        // ₦24/km at rate index 1
  let price = BASE + Math.round(distanceKm * PER_KM_INDEX * vehicle.rateIndex);
  if (spec.requiresReefer) price = Math.round(price * 1.25);          // cold-chain
  if (spec.riskClass === 'regulated') price = Math.round(price * 1.1); // pharma/humanitarian
  if (spec.riskClass === 'permitted') price = Math.round(price * 1.15); // livestock/heavy permits
  if (spec.riskClass === 'high_value') price = Math.round(price * 1.05);
  if (opts?.urgency === 'express') price = Math.round(price * 1.3);
  if (opts?.securityRisk && opts.securityRisk > 0.6) price = Math.round(price * 1.12);
  if (opts?.ltlSharePct) price = Math.round(price * Math.max(0.15, opts.ltlSharePct / 100));
  return price;
}

export interface MarketplaceProvider {
  vendorId: string;
  name: string;
  /** Verified providers only — verification enforced upstream (FAMS vendor gate). */
  verified: boolean;
  rating: number;
  onTimePct: number;
  fleets: Partial<Record<FreightVehicleSpec['category'], number>>;
  regions: string[];                 // operating regions (state codes)
}

export class InterstateMarketplace {
  private providers: MarketplaceProvider[] = [];
  private shipments = new Map<string, Shipment>();
  private seq = 0;

  registerProvider(p: MarketplaceProvider): MarketplaceProvider {
    this.providers.push(p);
    return p;
  }

  listProviders(region?: string): MarketplaceProvider[] {
    return this.providers.filter((p) => p.verified && (!region || p.regions.includes(region)));
  }

  getShipment(id: string): Shipment | undefined { return this.shipments.get(id); }
  listShipments(filter?: { customerId?: string; vendorId?: string; status?: ShipmentStatus }): Shipment[] {
    return [...this.shipments.values()].filter((s) =>
      (!filter?.customerId || s.party.customerId === filter.customerId) &&
      (!filter?.vendorId || s.party.vendorId === filter.vendorId) &&
      (!filter?.status || s.status === filter.status));
  }

  /** § booking: quote_request + compare_providers — AI recommends best provider. */
  requestQuote(req: QuoteRequest, ctx: { originState: string }): QuoteResult {
    const spec = SERVICES.find((s) => s.code === req.service)!;
    const vehicle = bestVehicle(req.cargo, spec);
    if (!vehicle) throw new Error(`No eligible vehicle for cargo ${req.cargo.categories.join('/')} ${req.cargo.weightKg}kg`);
    const isLtl = spec.typicalMode !== 'ftl' && (req.option === 'quote_request' || req.service === 'ltl' || req.service === 'shared_cargo');

    const offers: ProviderOffer[] = this.listProviders(ctx.originState)
      .filter((p) => (p.fleets[vehicle.category] ?? 0) > 0)
      .map((p) => {
        const priceMinor = Math.round(estimatePrice(req.distanceKm, vehicle, spec, {
          urgency: req.urgency, securityRisk: req.routeSecurityRisk,
          ltlSharePct: isLtl ? 35 : undefined,
        }) * (0.94 + (5 - p.rating) * 0.02));      // better vendors price sharper
        const avgSpeedKph = vehicle.minRoadClass === 'street' ? 45 : 55;
        const etaHours = Math.round((req.distanceKm / avgSpeedKph + 1.5) * 10) / 10;   // + loading buffer
        return {
          vendorId: p.vendorId, vendorName: p.name, rating: p.rating, onTimePct: p.onTimePct,
          vehicleCategory: vehicle.category, priceMinor, etaHours,
          reasons: [
            `${vehicle.label} fits ${req.cargo.weightKg}kg ${req.cargo.categories.join('/')}`,
            `rating ${p.rating.toFixed(1)} · on-time ${p.onTimePct}%`,
          ],
        };
      })
      .sort((a, b) => (b.rating * 1000 + b.onTimePct) - (a.rating * 1000 + a.onTimePct) || a.priceMinor - b.priceMinor);

    return {
      shipmentId: `shp_${++this.seq}`,
      offers,
      recommendedVendorId: offers[0]?.vendorId,
      bestVehicle: vehicle,
      estimate: {
        priceMinor: offers[0]?.priceMinor ?? estimatePrice(req.distanceKm, vehicle, spec, { urgency: req.urgency, securityRisk: req.routeSecurityRisk }),
        etaHours: offers[0]?.etaHours ?? Math.round((req.distanceKm / 55 + 1.5) * 10) / 10,
      },
      currency: 'NGN',
    };
  }

  /** § booking: instant / scheduled / recurring / dedicated / return trip. */
  book(p: {
    quote: QuoteResult; vendorId: string; cargo: CargoDescriptor; service: InterstateService;
    stops: ShipmentStop[]; party: ShipmentParty; option: BookingOption;
    scheduledFor?: Date; recurrence?: 'weekly' | 'monthly';
    plate?: string; paymentMode: PaymentMode; insured?: boolean; insurancePolicy?: string;
  }): Shipment {
    const spec = SERVICES.find((s) => s.code === p.service)!;
    if (p.stops.some((s) => s.kind === 'pickup') && p.stops.some((s) => s.kind === 'dropoff')) {
      p.stops.sort((a, b) => (a.kind === b.kind ? a.sequence - b.sequence : a.kind === 'pickup' ? -1 : 1));
    }
    const now = new Date();
    const vehicle = p.quote.bestVehicle!;
    const shipment: Shipment = {
      id: p.quote.shipmentId,
      service: p.service, spec,
      cargo: { ...p.cargo, declaredValueMinor: p.cargo.declaredValueMinor ?? 0 },
      weightKg: p.cargo.weightKg,
      dimensionsM: vehicle.dimensionsM,
      stops: p.stops,
      party: { ...p.party, vendorId: p.vendorId },
      booking: { option: p.option, scheduledFor: p.scheduledFor, recurrence: p.recurrence },
      status: p.option === 'instant' ? 'driver_assigned' : p.option === 'scheduled' ? 'awaiting_pickup' : 'quote_accepted',
      assignedVehicle: { ...vehicle, plate: p.plate ?? `LAG-${100 + this.seq}XX`, vendorId: p.vendorId },
      etaAt: new Date(now.getTime() + p.quote.estimate.etaHours * 3600_000),
      checkpoints: [],
      security: {
        insuredMinor: p.insured ? Math.max(500_000, Math.round(p.quote.estimate.priceMinor * 0.05)) : 0,
        insurancePolicy: p.insurancePolicy,
        seals: [{ id: `seal_${p.quote.shipmentId}_1`, intact: true, installedAt: now }],
        tamperAlerts: [], geofenceAlerts: [],
        driverIdentityVerified: false, cargoVerified: false,
      },
      quoteMinor: p.quote.estimate.priceMinor,
      payment: { mode: p.paymentMode },
      createdAt: now, updatedAt: now,
    };
    this.shipments.set(shipment.id, shipment);
    return shipment;
  }

  /** Status machine — refuses illegal transitions. */
  advance(id: string, to: ShipmentStatus, patch?: Partial<Shipment>): Shipment {
    const s = this.shipments.get(id);
    if (!s) throw new Error(`Unknown shipment ${id}`);
    if (to !== s.status && !canTransition(s.status, to)) throw new Error(`Illegal transition ${s.status} → ${to}`);
    s.status = to;
    s.updatedAt = new Date();
    Object.assign(s, patch ?? {});
    return s;
  }

  /** § live tracking: checkpoint ping with ETA + geofence + tamper evaluation. */
  checkpoint(id: string, c: { lat: number; lng: number; label: string; note?: string; outsideGeofence?: boolean; sealBroken?: boolean }): { shipment: Shipment; notifications: string[] } {
    const s = this.shipments.get(id)!;
    const notifications: string[] = [];
    if (s.status === 'in_transit' || s.status === 'cargo_loaded') {
      s.status = 'checkpoint_update';
      notifications.push(`Checkpoint: ${c.label}`);
    }
    s.checkpoints.push({ at: new Date(), ...c });
    s.currentLat = c.lat; s.currentLng = c.lng;
    if (c.outsideGeofence) {
      s.security.geofenceAlerts.push({ at: new Date(), detail: `route deviation near ${c.label}` });
      notifications.push('⚠️ Geofence alert — shipment left the approved corridor');
    }
    if (c.sealBroken) {
      for (const seal of s.security.seals) if (seal.id === `seal_${id}_1`) seal.intact = false;
      s.security.tamperAlerts.push({ at: new Date(), sealId: `seal_${id}_1`, detail: `tamper detected near ${c.label}` });
      notifications.push('🚨 Tamper alert — cargo seal broken');
    }
    // remaining distance → next ETA (55 kph corridor average)
    const last = s.stops.filter((x) => x.kind === 'dropoff' && !x.completedAt).slice(-1)[0];
    if (last) {
      const km = haversineKm(c.lat, c.lng, last.lat, last.lng);
      s.etaAt = new Date(Date.now() + (km / 55) * 3600_000);
      notifications.push(`ETA update: ${s.etaAt.toISOString()}`);
    }
    s.updatedAt = new Date();
    return { shipment: s, notifications };
  }

  /** § cargo security: proofs with digital signature + photo confirmation. */
  attachProof(id: string, type: 'pickup' | 'delivery', proof: { photos: string[]; signedBy: string; signature: string }): ProofDocument {
    const s = this.shipments.get(id)!;
    const doc: ProofDocument = { type, photos: proof.photos, digitalSignature: proof.signature, signedBy: proof.signedBy, at: new Date() };
    if (type === 'pickup') {
      s.security.proofOfPickup = doc;
      s.security.cargoVerified = true;
      if (s.status === 'driver_assigned' || s.status === 'awaiting_pickup') this.advance(id, 'cargo_loaded');
    } else {
      s.security.proofOfDelivery = doc;
      if (s.status === 'in_transit' || s.status === 'checkpoint_update') this.advance(id, 'delivered');
    }
    return doc;
  }

  verifyDriver(id: string, ok = true): Shipment {
    const s = this.shipments.get(id)!;
    s.security.driverIdentityVerified = ok;
    s.updatedAt = new Date();
    return s;
  }

  /** § live tracking: shareable tracking links for authorized recipients. */
  shareTrackingLink(id: string, recipient: string, ttlHours = 72): { token: string; recipient: string; expiresAt: Date } {
    const s = this.shipments.get(id)!;
    void s;
    return { token: `trk_${id}_${Buffer.from(recipient).toString('base64url').slice(0, 10)}`, recipient, expiresAt: new Date(Date.now() + ttlHours * 3600_000) };
  }

  settle(id: string, split: SettlementSplit): Shipment {
    const s = this.shipments.get(id)!;
    s.payment = { ...s.payment!, settledMinor: split.vendorPayoutMinor };
    if (s.status === 'delivered') this.advance(id, 'completed');
    return s;
  }

  rate(id: string, score: number, comment?: string): Shipment {
    const s = this.shipments.get(id)!;
    s.rating = { score, comment };
    return s;
  }
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
