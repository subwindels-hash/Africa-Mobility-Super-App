/**
 * Vertical Marketplaces (docs/03/04): Aviation charter, Hotels, Tourism,
 * Security services, Roadside assistance, Intercity transport, Marine
 * (future-ready) and Corporate services — one engine, FAMS-gated per module,
 * escrow-backed. Completes the remaining service verticals of the platform.
 */

// ── shared engine ───────────────────────────────────────────────────────────

export interface VerticalProvider { id: string; name: string; rating: number; meta?: Record<string, unknown> }
export interface VerticalQuote { provider: VerticalProvider; priceMinor: number; etaOrSchedule: string; notes?: string }
export interface VerticalBooking {
  id: string; vertical: string; providerId: string; customerId: string;
  details: Record<string, unknown>; priceMinor: number; status: 'booked' | 'in_progress' | 'completed' | 'cancelled';
  escrowId?: string; createdAt: Date;
}

export interface FamsVerticalGate { module(code: string, ctx?: Record<string, unknown>): boolean }
export interface VerticalEscrowHooks { fund(bookingId: string, amountMinor: number): string; release(escrowId: string): void; refund(escrowId: string): void }

export class VerticalEngine {
  private providers = new Map<string, VerticalProvider[]>();
  private bookings = new Map<string, VerticalBooking>();
  private seq = 0;

  constructor(private fams: FamsVerticalGate = { module: () => true }, private escrow?: VerticalEscrowHooks) {}

  register(vertical: string, provider: VerticalProvider): void {
    const list = this.providers.get(vertical) ?? [];
    list.push(provider);
    this.providers.set(vertical, list);
  }

  quote(vertical: string, ctx: { customerId: string; priceOf: (p: VerticalProvider) => number; etaOf: (p: VerticalProvider) => string; famsCtx?: Record<string, unknown> }): VerticalQuote[] {
    if (!this.fams.module(vertical, ctx.famsCtx)) throw new Error(`${vertical} is not activated (FAMS)`);
    return (this.providers.get(vertical) ?? [])
      .map((p) => ({ provider: p, priceMinor: ctx.priceOf(p), etaOrSchedule: ctx.etaOf(p) }))
      .sort((a, b) => b.provider.rating - a.provider.rating || a.priceMinor - b.priceMinor);
  }

  book(vertical: string, p: { providerId: string; customerId: string; priceMinor: number; details: Record<string, unknown>; famsCtx?: Record<string, unknown> }): VerticalBooking {
    if (!this.fams.module(vertical, p.famsCtx)) throw new Error(`${vertical} is not activated (FAMS)`);
    const provider = (this.providers.get(vertical) ?? []).find((x) => x.id === p.providerId);
    if (!provider) throw new Error(`provider ${p.providerId} not in ${vertical}`);
    const b: VerticalBooking = { id: `vbk_${++this.seq}`, vertical, providerId: p.providerId, customerId: p.customerId, details: p.details, priceMinor: p.priceMinor, status: 'booked', createdAt: new Date() };
    if (this.escrow) b.escrowId = this.escrow.fund(b.id, p.priceMinor);
    this.bookings.set(b.id, b);
    return b;
  }

  complete(bookingId: string): VerticalBooking {
    const b = this.bookings.get(bookingId)!;
    if (b.status !== 'in_progress' && b.status !== 'booked') throw new Error(`cannot complete from ${b.status}`);
    b.status = 'completed';
    if (b.escrowId) this.escrow?.release(b.escrowId);
    return b;
  }

  cancel(bookingId: string): VerticalBooking {
    const b = this.bookings.get(bookingId)!;
    if (b.status === 'completed') throw new Error('already completed');
    b.status = 'cancelled';
    if (b.escrowId) this.escrow?.refund(b.escrowId);
    return b;
  }

  get(bookingId: string) { return this.bookings.get(bookingId); }
  list(vertical?: string) { return [...this.bookings.values()].filter((b) => !vertical || b.vertical === vertical); }
}

// ── Aviation charter (docs/03 §aviation) ────────────────────────────────────

export const AIRCRAFT_TYPES = [
  { type: 'helicopter', label: 'Helicopter', seats: 6, ratePerKmMinor: 18_000, minHireMinor: 8_000_000 },
  { type: 'private_jet', label: 'Private Jet', seats: 12, ratePerKmMinor: 42_000, minHireMinor: 45_000_000 },
  { type: 'air_ambulance', label: 'Air Ambulance', seats: 4, ratePerKmMinor: 30_000, minHireMinor: 30_000_000 },
  { type: 'charter_aircraft', label: 'Charter Aircraft', seats: 30, ratePerKmMinor: 26_000, minHireMinor: 25_000_000 },
] as const;
export type AircraftType = (typeof AIRCRAFT_TYPES)[number]['type'];

export function aviationQuote(aircraft: AircraftType, distanceKm: number, passengers: number): { priceMinor: number; ok: boolean; reason?: string } {
  const spec = AIRCRAFT_TYPES.find((a) => a.type === aircraft)!;
  if (passengers > spec.seats) return { priceMinor: 0, ok: false, reason: `${spec.label} seats ${spec.seats} — ${passengers} requested` };
  return { priceMinor: Math.max(spec.minHireMinor, Math.round(distanceKm * spec.ratePerKmMinor)), ok: true };
}

// ── Hotels & accommodation (docs/03 §travel) ────────────────────────────────

export interface RoomType { code: string; name: string; rateMinorPerNight: number; refundable: boolean }
export const ROOM_TYPES: RoomType[] = [
  { code: 'standard', name: 'Standard Room', rateMinorPerNight: 4_500_000, refundable: true },
  { code: 'deluxe', name: 'Deluxe Room', rateMinorPerNight: 7_200_000, refundable: true },
  { code: 'executive_suite', name: 'Executive Suite', rateMinorPerNight: 15_000_000, refundable: false },
  { code: 'presidential', name: 'Presidential Suite', rateMinorPerNight: 45_000_000, refundable: false },
];

export function hotelQuote(roomCode: string, nights: number): { priceMinor: number; refundable: boolean } {
  const room = ROOM_TYPES.find((r) => r.code === roomCode)!;
  return { priceMinor: room.rateMinorPerNight * nights, refundable: room.refundable };
}

/** Free cancellation window: ≥48h before check-in, refundable rooms only. */
export function hotelCancellation(info: { refundable: boolean; hoursToCheckIn: number; priceMinor: number }): { refundMinor: number; penaltyMinor: number } {
  if (!info.refundable) return { refundMinor: 0, penaltyMinor: info.priceMinor };
  if (info.hoursToCheckIn >= 48) return { refundMinor: info.priceMinor, penaltyMinor: 0 };
  const penalty = Math.round(info.priceMinor * 0.2);   // late cancellation fee
  return { refundMinor: info.priceMinor - penalty, penaltyMinor: penalty };
}

// ── Tourism experiences (docs/03 §tourism — FAMS-gated, migration 006) ──────

export const EXPERIENCES = [
  { code: 'exp_lekki_conservation', name: 'Lekki Conservation Canopy Walk', baseMinor: 1_800_000, durationHours: 3 },
  { code: 'exp_olorunsogo_waterfall', name: 'Olorunsogo Waterfall Trek', baseMinor: 3_500_000, durationHours: 6 },
  { code: 'exp_calabar_festival', name: 'Calabar Festival VIP Package', baseMinor: 12_000_000, durationHours: 10 },
  { code: 'exp_yankari_safari', name: 'Yankari Safari Reserve', baseMinor: 8_500_000, durationHours: 12 },
] as const;

export function tourismQuote(code: string, people: number): { priceMinor: number } {
  const e = EXPERIENCES.find((x) => x.code === code)!;
  const groupDiscount = people >= 6 ? 0.9 : people >= 3 ? 0.95 : 1;
  return { priceMinor: Math.round(e.baseMinor * people * groupDiscount) };
}

// ── Security services marketplace (docs/03 §security) ───────────────────────

export const SECURITY_SERVICES = ['bodyguard', 'vip_convoy', 'event_security', 'executive_protection', 'surveillance_install', 'security_consulting', 'cash_transit'] as const;
export type SecurityService = (typeof SECURITY_SERVICES)[number];

const ARMED_SERVICES: SecurityService[] = ['vip_convoy', 'executive_protection', 'cash_transit'];

/** Armed services require a verified corporate/government client + police clearance. */
export function securityEligible(service: SecurityService, client: { verifiedCorporate: boolean; policeClearance: boolean }): { eligible: boolean; reason?: string } {
  if (ARMED_SERVICES.includes(service) && !client.verifiedCorporate) return { eligible: false, reason: `${service} requires a verified corporate/government account` };
  if (ARMED_SERVICES.includes(service) && !client.policeClearance) return { eligible: false, reason: `${service} requires police clearance on file` };
  return { eligible: true };
}

export function securityQuote(service: SecurityService, agents: number, hours: number): { priceMinor: number } {
  const rates: Record<SecurityService, number> = {
    bodyguard: 450_000, vip_convoy: 800_000, event_security: 300_000, executive_protection: 950_000,
    surveillance_install: 5_000_000, security_consulting: 3_500_000, cash_transit: 1_200_000,
  };
  if (service === 'surveillance_install' || service === 'security_consulting') return { priceMinor: rates[service] * agents };
  return { priceMinor: rates[service] * agents * hours };
}

// ── Roadside assistance (docs/03 §roadside) ─────────────────────────────────

export const ROADSIDE_SERVICES = ['tow_5km', 'tow_50km', 'jump_start', 'fuel_delivery_10l', 'tyre_change', 'locksmith', 'engine_recovery', 'winching'] as const;
export type RoadsideService = (typeof ROADSIDE_SERVICES)[number];

export const ROADSIDE_RATES: Record<RoadsideService, number> = {
  tow_5km: 3_500_000, tow_50km: 9_000_000, jump_start: 1_200_000, fuel_delivery_10l: 2_500_000,
  tyre_change: 1_500_000, locksmith: 2_200_000, engine_recovery: 7_500_000, winching: 6_000_000,
};

/** Nearest-provider dispatch by haversine distance. */
export function nearestProvider<T extends { lat: number; lng: number; available: boolean }>(providers: T[], at: { lat: number; lng: number }): T | null {
  const available = providers.filter((p) => p.available);
  if (!available.length) return null;
  const dist = (p: T) => { const d = Math.hypot(p.lat - at.lat, p.lng - at.lng); return d; };
  return available.sort((a, b) => dist(a) - dist(b))[0];
}

// ── Intercity transport (docs/03 §transportation) ───────────────────────────

export interface IntercityRoute { id: string; from: string; to: string; km: number; baseMinor: number; operator: string; departures: string[] }
export const INTERCITY_ROUTES: IntercityRoute[] = [
  { id: 'ic_lag_abj', from: 'Lagos', to: 'Abuja', km: 720, baseMinor: 3_800_000, operator: 'GodIsGood', departures: ['06:30', '09:00', '15:00', '22:00'] },
  { id: 'ic_lag_iba', from: 'Lagos', to: 'Ibadan', km: 130, baseMinor: 1_100_000, operator: 'ABC Transport', departures: ['07:00', '12:00', '17:30'] },
  { id: 'ic_abj_kan', from: 'Abuja', to: 'Kano', km: 550, baseMinor: 3_200_000, operator: 'GUO', departures: ['06:00', '14:00'] },
];

export function intercityQuote(routeId: string, seatClass: 'regular' | 'vip' | 'sleeper'): { priceMinor: number } {
  const route = INTERCITY_ROUTES.find((r) => r.id === routeId)!;
  const factor = seatClass === 'vip' ? 1.5 : seatClass === 'sleeper' ? 1.8 : 1;
  return { priceMinor: Math.round(route.baseMinor * factor) };
}

// ── Marine (future-ready — FAMS OFF by default) ─────────────────────────────

export const MARINE_VESSELS = [
  { code: 'boat', label: 'Passenger Boat', capacity: 20, ratePerHourMinor: 2_500_000 },
  { code: 'yacht', label: 'Luxury Yacht', capacity: 12, ratePerHourMinor: 18_000_000 },
  { code: 'ferry', label: 'Cargo Ferry', capacity: 200, ratePerHourMinor: 8_500_000 },
] as const;

export function marineQuote(vessel: 'boat' | 'yacht' | 'ferry', hours: number): { priceMinor: number } {
  const v = MARINE_VESSELS.find((x) => x.code === vessel)!;
  return { priceMinor: v.ratePerHourMinor * hours };
}

// ── Corporate services (docs/03 §corporate) ─────────────────────────────────

export const CORPORATE_SERVICES = ['protocol_travel_mgmt', 'errand_running', 'facility_mgmt', 'fleet_mgmt_outsource', 'event_logistics', 'executive_assistant'] as const;
export type CorporateService = (typeof CORPORATE_SERVICES)[number];

export function corporateQuote(service: CorporateService, units: number, days: number): { priceMinor: number } {
  const perUnitPerDay: Record<CorporateService, number> = {
    protocol_travel_mgmt: 1_800_000, errand_running: 350_000, facility_mgmt: 900_000,
    fleet_mgmt_outsource: 1_200_000, event_logistics: 2_500_000, executive_assistant: 2_200_000,
  };
  return { priceMinor: perUnitPerDay[service] * units * days };
}
