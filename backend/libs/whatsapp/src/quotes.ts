/**
 * AMSA WhatsApp AI Quotation Engine (docs/26 §10 — "AI Quotation Generation").
 * Deterministic baseline rate cards per vertical; the LLM layer narrates,
 * this engine prices (same guardrail pattern as the fare engine).
 * All amounts: NGN minor units.
 */

export interface AiQuote {
  label: string;
  minMinor: number;
  maxMinor: number;
  currency: 'NGN';
  validityHours: number;
  milestones?: { label: string; pct: number }[];
  basis: string; // human-readable pricing basis shown to the customer
}

interface RateCard {
  basis: (ctx: QuoteContext) => string;
  price: (ctx: QuoteContext) => { min: number; max: number };
  milestones?: { label: string; pct: number }[];
  validityHours: number;
}

export interface QuoteContext {
  days?: number;      // engagement length (security/aviation hours→days proxy)
  agents?: number;    // security personnel
  pax?: number;       // passengers
  nights?: number;    // accommodation
  hours?: number;     // aviation block hours
  serviceType?: string;
  assistType?: string;
  rooms?: number;
}

const n = (major: number) => major * 100; // ₦major → minor units

/** Security marketplace — per-agent-day rate card (planning baseline, docs/02 §5.1). */
const SECURITY: RateCard = {
  basis: (c) => `${c.agents ?? 2} licensed ${c.agents === 1 ? 'agent' : 'agents'} × ${c.days ?? 1} day${(c.days ?? 1) > 1 ? 's' : ''} + team lead vehicle`,
  price: (c) => {
    const agents = c.agents ?? 2;
    const days = Math.max(1, c.days ?? 1);
    const mid = agents * days * n(120_000) + n(60_000); // lead vehicle/logistics
    return { min: Math.round(mid * 0.9), max: Math.round(mid * 1.25) };
  },
  milestones: [
    { label: 'Mobilisation', pct: 50 },
    { label: 'Mid-engagement', pct: 30 },
    { label: 'Completion report', pct: 20 },
  ],
  validityHours: 24,
};

/** Aviation — block-hour rate card by service type. */
const AVIATION: RateCard = {
  basis: (c) => `${aviationLabel(c.serviceType)} · ${c.hours ?? 1} block hour${(c.hours ?? 1) > 1 ? 's' : ''}${c.pax ? ` · ${c.pax} pax` : ''}`,
  price: (c) => {
    const hours = Math.max(1, c.hours ?? 1);
    const hourly: Record<string, number> = {
      helicopter: n(2_500_000), jet: n(8_000_000), charter: n(4_500_000), ambulance: n(6_500_000),
    };
    const h = hourly[aviationKey(c.serviceType)] ?? hourly.charter;
    return { min: h * hours, max: Math.round(h * hours * 1.3 + n(500_000)) }; // repositioning/fees band
  },
  milestones: [
    { label: 'Booking confirmation', pct: 50 },
    { label: 'Wheels up', pct: 40 },
    { label: 'Post-flight', pct: 10 },
  ],
  validityHours: 12,
};

/** Roadside assistance — call-out + unit rates (matches database/service_categories seeds). */
const ROADSIDE: RateCard = {
  basis: (c) => roadsideLabel(c.assistType),
  price: (c) => {
    const t = c.assistType ?? 'mechanical';
    const table: Record<string, { min: number; max: number }> = {
      towing: { min: n(35_000), max: n(90_000) },            // + ₦300/km beyond 10km included
      vehicle_recovery: { min: n(60_000), max: n(250_000) },
      mechanical: { min: n(25_000), max: n(120_000) },       // call-out + first hour
      fuel_delivery: { min: n(15_000), max: n(35_000) },     // + ₦900/litre
      tyre_replacement: { min: n(45_000), max: n(120_000) }, // per tyre fitted
      battery: { min: n(20_000), max: n(80_000) },
    };
    return table[t] ?? table.mechanical;
  },
  validityHours: 1,
};

/** Accommodation — nightly rate card by stay type. */
const ACCOMMODATION: RateCard = {
  basis: (c) => `${stayLabel(c.serviceType)} · ${c.nights ?? 1} night${(c.nights ?? 1) > 1 ? 's' : ''}${c.rooms && c.rooms > 1 ? ` · ${c.rooms} rooms` : ''}`,
  price: (c) => {
    const nights = Math.max(1, c.nights ?? 1);
    const nightly: Record<string, number> = {
      hotel: n(45_000), apartment: n(60_000), vacation_rental: n(75_000),
      short_let: n(55_000), corporate: n(80_000),
    };
    const base = nightly[stayKey(c.serviceType)] ?? nightly.hotel;
    return { min: base * nights, max: Math.round(base * nights * 1.6) };
  },
  validityHours: 24,
};

function aviationKey(serviceType?: string): string {
  const t = (serviceType ?? '').toLowerCase();
  if (t.includes('helicopter') || t.includes('heli')) return 'helicopter';
  if (t.includes('jet')) return 'jet';
  if (t.includes('ambulance')) return 'ambulance';
  return 'charter';
}
function aviationLabel(serviceType?: string): string {
  return { helicopter: 'Helicopter charter', jet: 'Private jet', charter: 'Charter flight', ambulance: 'Air ambulance' }[aviationKey(serviceType)] ?? 'Charter flight';
}
function roadsideLabel(assistType?: string): string {
  return {
    towing: 'Towing (10km included, ₦300/km after)', vehicle_recovery: 'Vehicle recovery operation',
    mechanical: 'Emergency mechanic call-out', fuel_delivery: 'Emergency fuel delivery (₦900/litre)',
    tyre_replacement: 'Tyre replacement (fitted)', battery: 'Battery assistance / jump-start',
  }[assistType ?? 'mechanical'] ?? 'Emergency roadside assistance';
}
function stayKey(serviceType?: string): string {
  const t = (serviceType ?? '').toLowerCase();
  if (t.includes('apartment')) return 'apartment';
  if (t.includes('vacation') || t.includes('rental')) return 'vacation_rental';
  if (t.includes('short')) return 'short_let';
  if (t.includes('corporate')) return 'corporate';
  return 'hotel';
}
function stayLabel(serviceType?: string): string {
  return { hotel: 'Hotel', apartment: 'Apartment', vacation_rental: 'Vacation rental', short_let: 'Short-let', corporate: 'Corporate accommodation' }[stayKey(serviceType)] ?? 'Stay';
}

/** Generate a quote for a draft vertical. Returns undefined where live search is required (flights). */
export function generateQuote(vertical: string, ctx: QuoteContext): AiQuote | undefined {
  const card: RateCard | undefined =
    vertical === 'security' ? SECURITY
    : vertical === 'aviation' ? AVIATION
    : vertical === 'roadside' ? ROADSIDE
    : vertical === 'accommodation' ? ACCOMMODATION
    : undefined;
  if (!card) return undefined;
  const { min, max } = card.price(ctx);
  return {
    label: card.basis(ctx),
    minMinor: min, maxMinor: max, currency: 'NGN',
    validityHours: card.validityHours,
    milestones: card.milestones,
    basis: card.basis(ctx),
  };
}

export function formatQuote(q: AiQuote): string {
  const fmt = (m: number) => `₦${(m / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  const band = q.minMinor === q.maxMinor ? fmt(q.minMinor) : `${fmt(q.minMinor)} – ${fmt(q.maxMinor)}`;
  return `${band} · ${q.basis} · valid ${q.validityHours}h${q.milestones ? ' · milestone escrow' : ''}`;
}
