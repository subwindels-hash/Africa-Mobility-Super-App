import { distanceMeters, money, type GeoPoint, type Money } from './types';

/**
 * Fare engine (docs/05 FR-BKG-005):
 * base + distance×perKm + time×perMin + extras (stops, wait) with surge guardrails.
 * All amounts in minor units. Surge: floor 0.85×, cap 2.0× (configurable).
 */
export interface PricingRule {
  baseFare: number;
  perKm: number;          // minor units per km
  perMinute: number;
  perStop: number;
  waitPerMinute: number;
  minimumFare: number;
  surgeCap: number;       // e.g. 2.0
  surgeFloor: number;     // e.g. 0.85
  surgeParticipation: boolean;
  takeRatePct: number;    // platform commission %, e.g. 18
  vatPct: number;         // VAT on platform fee, e.g. 7.5
}

export const DEFAULT_RULE: PricingRule = {
  baseFare: 1_200_000, perKm: 16_000, perMinute: 2_500, perStop: 200_000,
  waitPerMinute: 50_000, minimumFare: 1_800_000, surgeCap: 2.0, surgeFloor: 0.85,
  surgeParticipation: true, takeRatePct: 18, vatPct: 7.5,
};

export function clampSurge(multiplier: number, rule: PricingRule): number {
  const m = Number.isFinite(multiplier) ? multiplier : 1;
  return Math.min(rule.surgeCap, Math.max(rule.surgeFloor, m));
}

export interface FareInput {
  pickup: GeoPoint;
  dropoff: GeoPoint;
  stops?: GeoPoint[];
  estimatedMinutes?: number;   // route time estimate
  surgeMultiplier?: number;    // from AI dynamic pricing (advisory)
  waitMinutes?: number;
  currency?: 'NGN' | 'GHS' | 'KES' | 'ZAR';
  rule?: Partial<PricingRule>;
}

export interface FareBreakdown {
  currency: string;
  base: number;
  distance: number;        // meters
  distanceFare: number;
  timeFare: number;
  stopsFare: number;
  waitFare: number;
  surge: number;           // applied multiplier (clamped)
  subtotal: number;
  total: number;
  range: { min: number; max: number }; // AI-style confidence band
}

/** Deterministic fare computation — the AI model proposes ranges; this engine decides. */
export function computeFare(input: FareInput): FareBreakdown {
  const rule: PricingRule = { ...DEFAULT_RULE, ...input.rule };
  const waypoints = [input.pickup, ...(input.stops ?? []), input.dropoff];
  let distance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    distance += distanceMeters(waypoints[i], waypoints[i + 1]);
  }
  // Route factor 1.3 (straight-line → road approximation until OSRM/Google callback)
  const roadDistance = Math.round(distance * 1.3);
  const minutes = input.estimatedMinutes ?? Math.max(5, Math.round((roadDistance / 1000) / 22 * 60));
  const stops = input.stops?.length ?? 0;

  const surge = rule.surgeParticipation ? clampSurge(input.surgeMultiplier ?? 1, rule) : 1;

  const distanceFare = Math.round((roadDistance / 1000) * rule.perKm);
  const timeFare = Math.round(minutes * rule.perMinute);
  const stopsFare = stops * rule.perStop;
  const waitFare = (input.waitMinutes ?? 0) * rule.waitPerMinute;
  const base = rule.baseFare;

  const subtotal = base + distanceFare + timeFare + stopsFare + waitFare;
  const surged = Math.round(subtotal * surge);
  const total = Math.max(rule.minimumFare, surged);

  // Confidence band (±8% at low surge → ±12% at cap) — mirrors AI fare-prediction UX
  const spread = 0.08 + 0.04 * (surge - 1);
  return {
    currency: input.currency ?? 'NGN',
    base, distance: roadDistance, distanceFare, timeFare, stopsFare, waitFare,
    surge, subtotal: surged, total,
    range: {
      min: Math.round(total * (1 - spread)),
      max: Math.round(total * (1 + spread)),
    },
  };
}

/** Post-trip finalization: locked fare + extras beyond quote (extra stops/wait billed). */
export function finalizeFare(quoteTotal: Money, extras: { extraWaitMinutes?: number; extraStops?: number }, rule: PricingRule = DEFAULT_RULE): Money {
  const extra =
    (extras.extraWaitMinutes ?? 0) * rule.waitPerMinute +
    (extras.extraStops ?? 0) * rule.perStop;
  return money(quoteTotal.amount + extra, quoteTotal.currency);
}

/** Settlement split: commission + VAT on platform fee + vendor net (docs/07 §3.2). */
export interface SettlementSplit {
  gross: Money;
  commission: Money;
  vat: Money;
  vendorNet: Money;
}

export function splitSettlement(gross: Money, takeRatePct = 18, vatPct = 7.5): SettlementSplit {
  const commission = Math.round((gross.amount * takeRatePct) / 100);
  const vat = Math.round((commission * vatPct) / 100);
  const vendorNet = gross.amount - commission - vat;
  return {
    gross,
    commission: money(commission, gross.currency),
    vat: money(vat, gross.currency),
    vendorNet: money(vendorNet, gross.currency),
  };
}
