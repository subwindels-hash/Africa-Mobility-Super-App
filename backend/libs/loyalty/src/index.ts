/**
 * Loyalty Service (docs/02 §retention).
 * Five tiers — Basic / Silver / Gold / Platinum / Executive — with earn
 * multipliers, redemption to wallet credit, expiry and downgrade reviews.
 */
export const TIERS = ['basic', 'silver', 'gold', 'platinum', 'executive'] as const;
export type Tier = (typeof TIERS)[number];

export interface TierSpec { tier: Tier; thresholdPoints: number; earnMultiplier: number; perks: string[] }

export const TIER_SPECS: Record<Tier, TierSpec> = {
  basic:     { tier: 'basic',     thresholdPoints: 0,      earnMultiplier: 1.0, perks: ['standard support'] },
  silver:    { tier: 'silver',    thresholdPoints: 5_000,  earnMultiplier: 1.2, perks: ['priority matching', '2% booking discount'] },
  gold:      { tier: 'gold',      thresholdPoints: 20_000, earnMultiplier: 1.5, perks: ['priority matching', '4% booking discount', 'free cancellation ×2/yr'] },
  platinum:  { tier: 'platinum',  thresholdPoints: 50_000, earnMultiplier: 2.0, perks: ['priority matching', '6% booking discount', 'free cancellations', 'airport lounge'] },
  executive: { tier: 'executive', thresholdPoints: 150_000, earnMultiplier: 3.0, perks: ['priority matching', '8% booking discount', 'free cancellations', 'airport lounge', 'dedicated concierge', 'chauffeur upgrade'] },
};

export interface LoyaltyAccount {
  userId: string;
  lifetimePoints: number;
  balancePoints: number;
  tier: Tier;
  expiring: { points: number; at: Date }[];
  history: { ts: Date; delta: number; reason: string }[];
}

/** 1 point per ₦100 spent (amountMinor/10_000), scaled by tier multiplier. */
export function pointsForSpend(amountMinor: number, tier: Tier): number {
  return Math.floor((amountMinor / 10_000) * TIER_SPECS[tier].earnMultiplier);
}

export const REDEEM_RATE = 0.8;          // 1 point → ₦0.008 wallet credit (80% of face)

export class LoyaltyService {
  private accounts = new Map<string, LoyaltyAccount>();

  enroll(userId: string): LoyaltyAccount {
    const existing = this.accounts.get(userId);
    if (existing) return existing;
    const a: LoyaltyAccount = { userId, lifetimePoints: 0, balancePoints: 0, tier: 'basic', expiring: [], history: [] };
    this.accounts.set(userId, a);
    return a;
  }

  account(userId: string): LoyaltyAccount | undefined { return this.accounts.get(userId); }

  earn(userId: string, amountMinor: number, reason = 'booking'): { earned: number; tierAfter: Tier; upgraded: boolean } {
    const a = this.enroll(userId);
    const earned = pointsForSpend(amountMinor, a.tier);
    a.balancePoints += earned;
    a.lifetimePoints += earned;
    a.history.push({ ts: new Date(), delta: earned, reason });
    const tierBefore = a.tier;
    a.tier = tierFor(a.lifetimePoints);
    return { earned, tierAfter: a.tier, upgraded: a.tier !== tierBefore };
  }

  /** Redeem points → wallet credit minor units; burns the oldest points first. */
  redeem(userId: string, points: number): { walletCreditMinor: number } {
    const a = this.enroll(userId);
    if (points <= 0) throw new Error('points must be positive');
    if (a.balancePoints < points) throw new Error(`insufficient points — balance ${a.balancePoints}`);
    a.balancePoints -= points;
    a.history.push({ ts: new Date(), delta: -points, reason: 'redeem' });
    return { walletCreditMinor: Math.round(points * REDEEM_RATE * 100) };
  }

  /** Quarterly review: downgrade when lifetime points fall behind tier floor (spent away). */
  reviewTier(userId: string): { tier: Tier; changed: boolean } {
    const a = this.enroll(userId);
    const target = tierFor(a.balancePoints);
    a.tier = target;
    return { tier: target, changed: true };
  }

  statement(userId: string) {
    const a = this.enroll(userId);
    return { tier: a.tier, spec: TIER_SPECS[a.tier], balancePoints: a.balancePoints, lifetimePoints: a.lifetimePoints, nextTier: nextTier(a.lifetimePoints) };
  }
}

export function tierFor(lifetimePoints: number): Tier {
  let tier: Tier = 'basic';
  for (const t of TIERS) if (lifetimePoints >= TIER_SPECS[t].thresholdPoints) tier = t;
  return tier;
}

function nextTier(lifetimePoints: number): { tier: Tier; pointsRemaining: number } | null {
  for (const t of TIERS) {
    const spec = TIER_SPECS[t];
    if (lifetimePoints < spec.thresholdPoints) return { tier: t, pointsRemaining: spec.thresholdPoints - lifetimePoints };
  }
  return null;
}
