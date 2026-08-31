import { describe, expect, it } from 'vitest';
import {
  VendorService, VENDOR_TYPES, VERIFICATION_STEPS, TIER_SPECS,
  type VerificationStep, type SubscriptionTier,
} from '../libs/vendors/src/index';
import { LoyaltyService, TIERS, TIER_SPECS as LOYALTY_SPECS, pointsForSpend, tierFor } from '../libs/loyalty/src/index';

describe('vendors — 16 types, 11-step chain, subscriptions', () => {
  it('registers exactly 16 vendor types including Luxury Vehicle Owner', () => {
    expect(VENDOR_TYPES).toHaveLength(16);
    expect([...VENDOR_TYPES]).toEqual(expect.arrayContaining(['taxi_operator', 'luxury_vehicle_owner', 'aviation_charter', 'security_company', 'cold_chain_operator', 'corporate_services_firm']));
  });

  it('the 11-step verification chain ends with admin final approval', () => {
    expect(VERIFICATION_STEPS).toHaveLength(11);
    expect(VERIFICATION_STEPS[0]).toBe('account_created');
    expect(VERIFICATION_STEPS[10]).toBe('admin_final_approval');
  });

  it('steps are sequential — skipping ahead is refused', () => {
    const vs = new VendorService();
    vs.register('vnd_1', 'logistics_company', 'Kwik Logistics');
    expect(() => vs.decideStep('vnd_1', 'insurance_certificate', 'approved', 'ops')).toThrow(/blocked — business_registration_cac/);
  });

  it('activation ONLY after every step incl. admin approval — not before', () => {
    const vs = new VendorService();
    vs.register('vnd_2', 'luxury_vehicle_owner', 'Chief Fleet');
    vs.submit('vnd_2');
    for (const step of VERIFICATION_STEPS.slice(1, 10)) vs.decideStep('vnd_2', step, 'approved', 'ops');
    expect(vs.isActivatable('vnd_2')).toBe(false);                    // admin approval missing
    vs.decideStep('vnd_2', 'admin_final_approval', 'approved', 'admin_1');
    expect(vs.isActivatable('vnd_2')).toBe(true);
    expect(vs.activate('vnd_2').state).toBe('approved');
  });

  it('a rejected step returns the application to the vendor', () => {
    const vs = new VendorService();
    vs.register('vnd_3', 'hotel', 'Lagos Grand');
    vs.submit('vnd_3');
    vs.decideStep('vnd_3', 'business_registration_cac', 'approved', 'ops');
    const v = vs.decideStep('vnd_3', 'tax_id_tin_verified', 'rejected', 'ops');
    expect(v.state).toBe('returned');
  });

  it('subscription tiers gate booking volume and drive commission', () => {
    const vs = new VendorService();
    vs.register('vnd_4', 'interstate_freighter', 'HaulIt');
    for (const step of VERIFICATION_STEPS.slice(1)) vs.decideStep('vnd_4', step as VerificationStep, 'approved', 'admin_1');
    expect(TIER_SPECS.free.commissionPct).toBe(20);
    expect(TIER_SPECS.enterprise.commissionPct).toBe(10);
    expect(vs.canAcceptBooking('vnd_4', 20).allowed).toBe(false);       // free limit reached
    expect(vs.canAcceptBooking('vnd_4', 20).reason).toContain('upgrade');
    vs.setSubscription('vnd_4', 'enterprise' as SubscriptionTier);
    expect(vs.canAcceptBooking('vnd_4', 10_000).allowed).toBe(true);    // unlimited
    expect(vs.commissionFor('vnd_4')).toBe(10);
  });

  it('suspended vendors cannot take bookings', () => {
    const vs = new VendorService();
    vs.register('vnd_5', 'dispatch_rider_fleet', 'RidersNG');
    vs.suspend('vnd_5');
    expect(vs.canAcceptBooking('vnd_5', 0)).toMatchObject({ allowed: false, reason: 'vendor suspended' });
  });
});

describe('loyalty — five tiers, earn/redeem lifecycle', () => {
  it('defines Basic/Silver/Gold/Platinum/Executive with ascending thresholds & multipliers', () => {
    expect([...TIERS]).toEqual(['basic', 'silver', 'gold', 'platinum', 'executive']);
    expect(LOYALTY_SPECS.executive.earnMultiplier).toBe(3);
    expect(LOYALTY_SPECS.silver.thresholdPoints).toBe(5_000);
  });

  it('earning upgrades tiers as lifetime points cross thresholds', () => {
    const ls = new LoyaltyService();
    // 1 point per ₦100 at 1.0× — spend ₦50,000,000 → 5,000 pts → silver
    const r1 = ls.earn('usr_1', 50_000_000);
    expect(r1.tierAfter).toBe('silver');
    expect(r1.upgraded).toBe(true);
    const r2 = ls.earn('usr_1', 160_000_000);      // 16,000 more → 21k lifetime → gold
    expect(r2.tierAfter).toBe('gold');
  });

  it('multiplier compounds earnings at higher tiers', () => {
    expect(pointsForSpend(10_000_000, 'basic')).toBe(1_000);
    expect(pointsForSpend(10_000_000, 'platinum')).toBe(2_000);
    expect(tierFor(150_000)).toBe('executive');
  });

  it('redemption converts points to wallet credit at the documented rate', () => {
    const ls = new LoyaltyService();
    ls.earn('usr_2', 100_000_000);                 // 10,000 pts
    const out = ls.redeem('usr_2', 5_000);
    expect(out.walletCreditMinor).toBe(400_000);   // 5,000 pts × ₦0.008
    expect(() => ls.redeem('usr_2', 9_000)).toThrow(/insufficient/);   // only 5,000 left
  });

  it('statement exposes the next tier and points remaining', () => {
    const ls = new LoyaltyService();
    ls.earn('usr_3', 10_000_000);                  // 1,000 pts
    const st = ls.statement('usr_3');
    expect(st.nextTier).toEqual({ tier: 'silver', pointsRemaining: 4_000 });
  });
});
