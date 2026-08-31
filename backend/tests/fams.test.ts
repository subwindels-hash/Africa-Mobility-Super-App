import { describe, expect, it } from 'vitest';
import { FamsEngine, seedFams, UNAVAILABLE_MESSAGE } from '../libs/fams/src/index';

function engine(phase = 4) {
  const e = new FamsEngine();
  seedFams(e, phase);
  return e;
}

const NG = { country: 'NG', state: 'NG-LA', city: 'NG-LAG', userGroups: ['customers'] };

describe('FAMS — global service control', () => {
  it('phase 4 preset: transportation on, security on, marine off', () => {
    const e = engine(4);
    expect(e.verticalAvailable('transportation', NG)).toBe(true);
    expect(e.verticalAvailable('security', NG)).toBe(true);
    expect(e.verticalAvailable('marine', NG)).toBe(false);
  });

  it('phase 1 preset: travel, hotels, security, aviation all off', () => {
    const e = engine(1);
    expect(e.verticalAvailable('travel', NG)).toBe(false);
    expect(e.verticalAvailable('hotels', NG)).toBe(false);
    expect(e.verticalAvailable('security', NG)).toBe(false);
    expect(e.verticalAvailable('aviation', NG)).toBe(false);
    expect(e.verticalAvailable('whatsapp_ai' as string, NG)).toBe(true); // wallet/escrow/whatsapp are features; verticals on: transport/logistics
  });

  it('super admin can toggle a module at runtime without deploy', () => {
    const e = engine(4);
    expect(e.verticalAvailable('transportation', NG)).toBe(true);
    e.upsertRule({ id: 'global_transport_off', level: 'global', target: { kind: 'vertical', code: 'transportation' }, value: 'off', updatedBy: 'super_admin' });
    expect(e.verticalAvailable('transportation', NG)).toBe(false);
    e.deleteRule('global_transport_off');
    expect(e.verticalAvailable('transportation', NG)).toBe(true);
  });
});

describe('FAMS — geographic precedence', () => {
  it('country control: Kenya transport & logistics off, Ghana security off', () => {
    const e = engine(4);
    expect(e.verticalAvailable('transportation', { country: 'KE', userGroups: ['customers'] })).toBe(false);
    expect(e.verticalAvailable('logistics', { country: 'KE', userGroups: ['customers'] })).toBe(false);
    expect(e.verticalAvailable('transportation', { country: 'GH', userGroups: ['customers'] })).toBe(true);
    expect(e.verticalAvailable('security', { country: 'GH', userGroups: ['customers'] })).toBe(false);
  });

  it('state control: aviation off in Edo (covers Benin City)', () => {
    const e = engine(4);
    expect(e.evaluate('vertical', 'aviation', { country: 'NG', state: 'NG-ED', city: 'NG-BNI', userGroups: ['customers'] }).available).toBe(false);
  });

  it('city control: aviation off in Asaba even though Delta has no state rule', () => {
    const e = engine(4);
    expect(e.evaluate('vertical', 'aviation', { country: 'NG', state: 'NG-DE', city: 'NG-ASB', userGroups: ['customers'] }).available).toBe(false);
  });

  it('city ON overrides state OFF (more specific wins)', () => {
    const e = engine(4);
    // Warri (NG-BNI state) aviation off via Edo rule; enable specifically for a city
    e.upsertRule({ level: 'city', selector: 'NG-BNI', target: { kind: 'vertical', code: 'aviation' }, value: 'on', note: 'Benin airport ops cleared', updatedBy: 'admin' });
    expect(e.evaluate('vertical', 'aviation', { country: 'NG', state: 'NG-ED', city: 'NG-BNI', userGroups: ['customers'] }).available).toBe(true);
  });

  it('at equal level the most recent admin decision wins (override semantics)', () => {
    const e = new FamsEngine();
    e.upsertRule({ level: 'city', selector: 'NG-LAG', target: { kind: 'vertical', code: 'transportation' }, value: 'off', updatedBy: 'night_ops' });
    expect(e.verticalAvailable('transportation', NG)).toBe(false);
    e.upsertRule({ level: 'city', selector: 'NG-LAG', target: { kind: 'vertical', code: 'transportation' }, value: 'on', updatedBy: 'morning_ops' });
    expect(e.verticalAvailable('transportation', NG)).toBe(true); // newest decision overrides
  });
});

describe('FAMS — category / vendor / asset control', () => {
  it('category control: VIP taxi in maintenance, premium on', () => {
    const e = engine(4);
    expect(e.evaluate('category', 'ride.vip', NG).value).toBe('maintenance');
    expect(e.evaluate('category', 'ride.premium', NG).available).toBe(true);
  });

  it('vendor control: B suspended, C maintenance, A fine', () => {
    const e = engine(4);
    expect(e.verticalAvailable('transportation', { ...NG, vendorId: 'vnd_b' })).toBe(false);
    expect(e.evaluate('vertical', 'transportation', { ...NG, vendorId: 'vnd_c' }).value).toBe('maintenance');
    expect(e.verticalAvailable('transportation', { ...NG, vendorId: 'vnd_a' })).toBe(true);
  });

  it('asset control beats vendor availability (jet B disabled)', () => {
    const e = engine(4);
    expect(e.verticalAvailable('aviation', { ...NG, assetId: 'ast_jet_b' })).toBe(false);
    expect(e.verticalAvailable('aviation', { ...NG, assetId: 'ast_jet_a' })).toBe(true);
  });

  it('category inherits vertical state (marine category off while marine vertical off)', () => {
    const e = engine(4);
    expect(e.evaluate('category', 'marine.yacht', NG).available).toBe(false);
  });
});

describe('FAMS — user groups, rollout, time & geofence', () => {
  it('user-group activation: next-gen assistant only for beta/vip', () => {
    const e = engine(4);
    expect(e.evaluate('feature', 'ai.assistant_next_gen', { userGroups: ['customers'] }).available).toBe(false);
    expect(e.evaluate('feature', 'ai.assistant_next_gen', { userGroups: ['customers', 'beta'] }).available).toBe(true);
    expect(e.evaluate('feature', 'ai.assistant_next_gen', { userGroups: ['customers', 'vip'] }).available).toBe(true);
  });

  it('rollout percentage is deterministic per user and splits roughly', () => {
    const e = new FamsEngine();
    e.upsertRule({ level: 'global', target: { kind: 'feature', code: 'x.new_ui' }, value: 'on', rolloutPct: 50, updatedBy: 'a' });
    const on = [...Array(100).keys()].filter((i) => e.evaluate('feature', 'x.new_ui', { userId: `u${i}` }).available).length;
    expect(on).toBeGreaterThan(30);
    expect(on).toBeLessThan(70);
    expect(e.evaluate('feature', 'x.new_ui', { userId: 'u7' }).available)
      .toBe(e.evaluate('feature', 'x.new_ui', { userId: 'u7' }).available); // stable
  });

  it('time-based activation: seasonal promo expires after endsAt', () => {
    const e = engine(4);
    expect(e.evaluate('feature', 'promo.ride20', { now: new Date('2027-01-15') }).available).toBe(true);
    expect(e.evaluate('feature', 'promo.ride20', { now: new Date('2027-02-15') }).available).toBe(false);
  });

  it('geofenced activation: airport transfer only inside the MMIA fence', () => {
    const e = engine(4);
    const atMmia = { ...NG, location: { lat: 6.5774, lng: 3.3212 } };
    const inIbadan = { country: 'NG', state: 'NG-OY', city: 'NG-IBD', userGroups: ['customers'], location: { lat: 7.3775, lng: 3.9058 } };
    expect(e.evaluate('category', 'transfer.airport', atMmia).available).toBe(true);
    const far = e.evaluate('category', 'transfer.airport', inIbadan);
    expect(far.available).toBe(false); // outside fence → falls back to more restrictive (category rule absent → vertical on) — seeded off
  });
});

describe('FAMS — emergency kill switch', () => {
  it('immediate shutdown overrides every rule without deploy', () => {
    const e = engine(4);
    expect(e.verticalAvailable('transportation', NG)).toBe(true);
    e.setEmergency('vertical:transportation', true, 'super_admin', 'curfew directive');
    const d = e.evaluate('vertical', 'transportation', NG);
    expect(d.available).toBe(false);
    expect(d.source).toBe('emergency_stop');
    // even city-level ON cannot override
    e.upsertRule({ level: 'city', selector: 'NG-LAG', target: { kind: 'vertical', code: 'transportation' }, value: 'on', updatedBy: 'x' });
    expect(e.verticalAvailable('transportation', NG)).toBe(false);
    e.setEmergency('vertical:transportation', false, 'super_admin', 'lifted');
    expect(e.verticalAvailable('transportation', NG)).toBe(true);
  });

  it('kill switch targets payments/wallet/escrow/whatsapp modules too', () => {
    const e = engine(4);
    e.setEmergency('feature:whatsapp.ai', true, 'ops', 'incident investigation');
    expect(e.evaluate('feature', 'whatsapp.ai', {}).available).toBe(false);
    e.setEmergency('feature:wallet', true, 'ops', 'PSP outage');
    expect(e.evaluate('feature', 'wallet', {}).available).toBe(false);
  });
});

describe('FAMS — scheduled activations (scheduler tick)', () => {
  it('applies due one-shot activations and records execution', () => {
    const e = new FamsEngine();
    e.upsertRule({ level: 'global', target: { kind: 'vertical', code: 'travel' }, value: 'off', updatedBy: 'seed' });
    e.schedule({ level: 'global', target: { kind: 'vertical', code: 'travel' }, value: 'on', runAt: new Date('2027-01-01T00:00:00Z'), note: 'New Year launch' });
    expect(e.verticalAvailable('travel', NG)).toBe(false);
    const applied = e.tick(new Date('2027-01-01T00:01:00Z'));
    expect(applied).toHaveLength(1);
    expect(e.verticalAvailable('travel', NG)).toBe(true);
    // idempotent: re-tick does not reapply
    expect(e.tick(new Date('2027-01-02T00:00:00Z'))).toHaveLength(0);
  });
});

describe('FAMS — spec message & availability matrix', () => {
  it('exports the canonical unavailable message', () => {
    expect(UNAVAILABLE_MESSAGE).toBe('Service currently unavailable in your location.');
  });

  it('availability matrix covers all verticals for the dashboard', () => {
    const e = engine(4);
    const m = e.availabilityMatrix(NG, ['transportation', 'logistics', 'travel', 'hotels', 'security', 'aviation', 'marine', 'roadside']);
    expect(Object.keys(m)).toHaveLength(8);
    expect(m.transportation.available).toBe(true);
    expect(m.marine.available).toBe(false);
  });
});
