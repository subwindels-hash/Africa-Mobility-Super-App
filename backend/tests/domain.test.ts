import { describe, expect, it } from 'vitest';
import * as core from '../libs/core/src/index';

describe('booking state machine', () => {
  it('allows the happy path draft → settled', () => {
    const path: core.BookingStatus[] = ['draft', 'priced', 'requested', 'matched', 'confirmed', 'en_route', 'in_progress', 'completed', 'settled'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => core.assertTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it('rejects illegal jumps', () => {
    expect(() => core.assertTransition('draft', 'completed')).toThrow(core.IllegalTransitionError);
    expect(() => core.assertTransition('settled', 'refunded')).toThrow();
    expect(() => core.assertTransition('in_progress', 'requested')).toThrow();
  });

  it('treats settled/refunded as terminal', () => {
    expect(core.isTerminal('settled')).toBe(true);
    expect(core.isTerminal('refunded')).toBe(true);
    expect(core.isTerminal('disputed')).toBe(false);
  });
});

describe('fare engine', () => {
  const pickup = { lat: 6.4281, lng: 3.4219 };   // Victoria Island
  const dropoff = { lat: 6.6018, lng: 3.3515 };  // Ikeja

  it('computes a fare above minimum with sane distance', () => {
    const f = core.computeFare({ pickup, dropoff });
    expect(f.total).toBeGreaterThanOrEqual(core.DEFAULT_RULE.minimumFare);
    expect(f.distance).toBeGreaterThan(15000); // >15km road estimate
    expect(f.range.min).toBeLessThan(f.total);
    expect(f.range.max).toBeGreaterThan(f.total);
  });

  it('caps surge at the configured guardrail', () => {
    const f = core.computeFare({ pickup, dropoff, surgeMultiplier: 9 });
    expect(f.surge).toBe(core.DEFAULT_RULE.surgeCap);
    const f2 = core.computeFare({ pickup, dropoff, surgeMultiplier: 0.1 });
    expect(f2.surge).toBe(core.DEFAULT_RULE.surgeFloor);
  });

  it('charges extra stops and respects minimum fare', () => {
    const one = core.computeFare({ pickup, dropoff });
    const two = core.computeFare({ pickup, dropoff, stops: [{ lat: 6.5, lng: 3.4 }] });
    expect(two.total).toBeGreaterThan(one.total);
  });
});

describe('settlement split', () => {
  it('commission + vat + vendorNet === gross', () => {
    const s = core.splitSettlement({ amount: 1_550_000, currency: 'NGN' }, 18, 7.5);
    expect(s.commission.amount).toBe(279_000);
    expect(s.vat.amount).toBe(20_925);
    expect(s.commission.amount + s.vat.amount + s.vendorNet.amount).toBe(1_550_000);
  });
});

describe('double-entry ledger', () => {
  it('rejects unbalanced entries', () => {
    expect(() =>
      core.createEntry('test', 'bad', [
        { accountId: 'a', direction: 'D', amount: 100, currency: 'NGN' },
        { accountId: 'b', direction: 'C', amount: 90, currency: 'NGN' },
      ]),
    ).toThrow(core.UnbalancedEntryError);
  });

  it('balances escrow fund → release across accounts', () => {
    const actors = { customer: 'usr_1', vendor: 'vnd_1' };
    const total = { amount: 1_000_000, currency: 'NGN' as const };
    const fund = core.entryEscrowFund(actors, total, 'bkg_1');
    const s = core.splitSettlement(total, 18, 7.5);
    const rel = core.entryEscrowRelease(actors, s.gross, s.commission, s.vat, s.vendorNet, 'bkg_1');
    const entries = [fund, rel];
    for (const e of entries) expect(() =>
      core.createEntry(e.source, e.narration, e.lines, e.sourceRef),
    ).not.toThrow();
    // escrow liability nets to zero after fund+release (C then D of equal amount)
    const escrow = core.accountBalance(entries, 'escrow');
    expect(escrow[0].amount).toBe(0);
    // revenue account is liability/revenue-convention: credits minus debits
    const revenue = core.accountBalance(entries, 'revenue_commission');
    expect(-revenue[0].amount).toBe(s.commission.amount);
    const psp = core.accountBalance(entries, 'psp_clearing');
    expect(psp[0].amount).toBe(total.amount); // cash still at PSP until payout
  });
});

describe('matching engine', () => {
  const pickup = { lat: 6.4281, lng: 3.4219 };
  const candidates: core.Candidate[] = [
    { id: 'near-best', location: { lat: 6.4290, lng: 3.4225 }, rating: 4.9, acceptanceRate: 0.95, completionRate: 0.99, classFit: true, capacityOk: true, subscriptionTier: 'enterprise', onlineMinutes: 200, fraudRisk: 0.01 },
    { id: 'far-ok', location: { lat: 6.4700, lng: 3.4700 }, rating: 4.5, acceptanceRate: 0.8, completionRate: 0.95, classFit: true, capacityOk: true, subscriptionTier: 'standard', onlineMinutes: 30, fraudRisk: 0.05 },
    { id: 'wrong-class', location: { lat: 6.4290, lng: 3.4225 }, rating: 4.8, acceptanceRate: 0.9, completionRate: 0.98, classFit: false, capacityOk: true, subscriptionTier: 'professional', onlineMinutes: 100, fraudRisk: 0.02 },
    { id: 'high-risk', location: { lat: 6.4300, lng: 3.4230 }, rating: 4.7, acceptanceRate: 0.9, completionRate: 0.96, classFit: true, capacityOk: true, subscriptionTier: 'professional', onlineMinutes: 100, fraudRisk: 0.95 },
  ];

  it('ranks the close high-quality driver first and filters unfit', () => {
    const ranked = core.rankCandidates(candidates, { pickup, top: 5 });
    expect(ranked[0].id).toBe('near-best');
    expect(ranked.map((c) => c.id)).not.toContain('wrong-class');
    expect(ranked.map((c) => c.id)).not.toContain('high-risk');
  });

  it('excludes candidates beyond radius', () => {
    const ranked = core.rankCandidates(candidates, { pickup, maxRadiusM: 500, top: 5 });
    expect(ranked.every((c) => c.id !== 'far-ok')).toBe(true);
  });

  it('optimizes stop order no worse than input distance', () => {
    const stops = [
      { lat: 6.5, lng: 3.35 }, { lat: 6.45, lng: 3.3 }, { lat: 6.52, lng: 3.42 },
    ];
    const { order, distanceM } = core.optimizeStops(pickup, stops);
    expect(order).toHaveLength(3);
    expect(distanceM).toBeGreaterThan(0);
  });
});

describe('escrow lifecycle', () => {
  const mk = () => core.openEscrow({ bookingId: 'bkg_t', customer: 'usr_1', vendor: 'vnd_1', total: { amount: 2_000_000, currency: 'NGN' } });

  it('happy path: fund → hold → release with balanced entries', () => {
    let h = mk();
    h = core.fund(h);
    h = core.beginService(h);
    const { hold } = core.releaseOnCompletion(h, 'completed', core.DEFAULT_RULE);
    expect(hold.state).toBe('released');
    core.assertEscrowIntegrity(hold);
  });

  it('milestones: partial releases sum to total', () => {
    let h = core.openEscrow({
      bookingId: 'bkg_sec', customer: 'usr_2', vendor: 'vnd_sec',
      total: { amount: 850_000, currency: 'NGN' },
      milestones: [{ label: 'advance', pct: 50 }, { label: 'mid', pct: 30 }, { label: 'close', pct: 20 }],
    });
    h = core.fund(h); h = core.beginService(h);
    h = core.releaseMilestone(h, 0, core.DEFAULT_RULE);
    expect(h.state).toBe('partially_released');
    h = core.releaseMilestone(h, 1, core.DEFAULT_RULE);
    h = core.releaseMilestone(h, 2, core.DEFAULT_RULE);
    expect(h.state).toBe('released');
    expect(h.released).toBe(850_000);
    core.assertEscrowIntegrity(h);
  });

  it('rejects milestones that do not total 100%', () => {
    expect(() => core.openEscrow({
      bookingId: 'x', customer: 'a', vendor: 'b', total: { amount: 100, currency: 'NGN' },
      milestones: [{ label: 'a', pct: 60 }],
    })).toThrow(/100%/);
  });

  it('dispute split: refund + vendor release never exceeds total', () => {
    let h = core.openEscrow({
      bookingId: 'bkg_d', customer: 'usr_3', vendor: 'vnd_3',
      total: { amount: 1_000_000, currency: 'NGN' },
      milestones: [{ label: 'm1', pct: 50 }, { label: 'm2', pct: 50 }],
    });
    h = core.fund(h); h = core.beginService(h);
    h = core.releaseMilestone(h, 0, core.DEFAULT_RULE);
    h = core.openDispute(h);
    h = core.resolveDispute(h, { type: 'split', refundAmount: 300_000 }, core.DEFAULT_RULE);
    expect(h.state).toBe('partially_refunded');
    expect(h.released + h.refunded).toBe(1_000_000);
    core.assertEscrowIntegrity(h);
  });

  it('expiry refunds a funded hold', () => {
    let h = mk();
    h = core.fund(h);
    h = core.expire(h);
    expect(h.state).toBe('refunded');
    expect(h.refunded).toBe(2_000_000);
  });
});
