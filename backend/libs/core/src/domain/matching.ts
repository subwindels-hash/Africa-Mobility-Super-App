import { distanceMeters, type GeoPoint } from './types';

/**
 * Vendor/driver matching rank (docs/07 §2.1):
 * score = 0.35·proximity + 0.25·scorecard + 0.15·fit + 0.10·momentum
 *         + 0.08·tier + 0.07·health
 * Deterministic, testable; the online learner re-weights these in prod.
 */
export interface Candidate {
  id: string;
  location: GeoPoint;
  rating: number;            // 0..5
  acceptanceRate: number;    // 0..1
  completionRate: number;    // 0..1
  classFit: boolean;         // asset class matches requested class
  capacityOk: boolean;
  subscriptionTier: 'free' | 'standard' | 'professional' | 'enterprise';
  onlineMinutes: number;     // momentum in current session
  fraudRisk: number;         // 0..1 (1 = worst)
}

export interface MatchContext {
  pickup: GeoPoint;
  maxRadiusM?: number;       // default 6000
  top?: number;
}

const WEIGHTS = { proximity: 0.35, scorecard: 0.25, fit: 0.15, momentum: 0.1, tier: 0.08, health: 0.07 };

export function proximityScore(meters: number, maxRadius: number): number {
  return Math.max(0, 1 - meters / maxRadius);
}

export function tierScore(tier: Candidate['subscriptionTier']): number {
  return { free: 0.4, standard: 0.6, professional: 0.85, enterprise: 1 }[tier];
}

export function scoreCandidate(c: Candidate, ctx: MatchContext): number {
  const radius = ctx.maxRadiusM ?? 6000;
  const d = distanceMeters(ctx.pickup, c.location);
  if (d > radius || !c.classFit || !c.capacityOk) return 0; // hard filters
  if (c.fraudRisk >= 0.5) return 0;                           // safety hard filter
  if (c.rating < 3.5 || c.acceptanceRate < 0.4) return 0;     // quality floor
  const prox = proximityScore(d, radius);
  const scorecard = (c.rating / 5) * 0.5 + c.acceptanceRate * 0.25 + c.completionRate * 0.25;
  const momentum = Math.min(1, c.onlineMinutes / 240);
  const health = 1 - c.fraudRisk;
  return (
    WEIGHTS.proximity * prox +
    WEIGHTS.scorecard * scorecard +
    WEIGHTS.fit * 1 +
    WEIGHTS.momentum * momentum +
    WEIGHTS.tier * tierScore(c.subscriptionTier) +
    WEIGHTS.health * health
  );
}

/** Ranked shortlist for the dispatch cascade (offer #1 → 15s → #2 … ≤5 deep). */
export function rankCandidates(candidates: Candidate[], ctx: MatchContext): Candidate[] {
  return [...candidates]
    .map((c) => ({ c, s: scoreCandidate(c, ctx) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, ctx.top ?? 5)
    .map((x) => x.c);
}

/** Simple nearest-neighbor multi-stop sequence fallback (OR-tools replaces in prod). */
export function optimizeStops(start: GeoPoint, stops: GeoPoint[]): { order: number[]; distanceM: number } {
  const remaining = stops.map((_, i) => i);
  const order: number[] = [];
  let cur = start;
  let total = 0;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (const i of remaining) {
      const d = distanceMeters(cur, stops[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    total += bestD;
    cur = stops[best];
    order.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }
  return { order, distanceM: total };
}
