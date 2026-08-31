import { describe, expect, it } from 'vitest';
import {
  FamsEngine, seedFams, UNAVAILABLE_MESSAGE, PLATFORM_MODULES, USER_GROUPS, ASSET_TYPES,
  VENDOR_STATES, VENDOR_STATE_VALUE,
} from '../libs/fams/src/index';

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
    expect(UNAVAILABLE_MESSAGE).toBe('Service is currently unavailable in your location.');
  });

  it('availability matrix covers all verticals for the dashboard', () => {
    const e = engine(4);
    const m = e.availabilityMatrix(NG, ['transportation', 'logistics', 'travel', 'hotels', 'security', 'aviation', 'marine', 'roadside']);
    expect(Object.keys(m)).toHaveLength(8);
    expect(m.transportation.available).toBe(true);
    expect(m.marine.available).toBe(false);
  });
});

describe('FAMS — spec v2 expansion (24 global switches, categories, groups, assets)', () => {
  it('catalogs all 24 spec global switches (25 codes: taxi aliases rides)', () => {
    expect(PLATFORM_MODULES).toContain('taxi');
    expect(PLATFORM_MODULES).toContain('dispatch');
    expect(PLATFORM_MODULES).toContain('delivery');
    expect(PLATFORM_MODULES).toContain('accommodation');
    expect(PLATFORM_MODULES).toContain('voice_calls');
    expect(PLATFORM_MODULES).toContain('chat');
    expect(PLATFORM_MODULES).toContain('video_calls');
    expect(PLATFORM_MODULES).toContain('ai_features');
    expect(PLATFORM_MODULES.length).toBeGreaterThanOrEqual(24);
  });

  it('spec phases: phase 1 disables aviation/marine/security/hotels, phase 5 enables marine', () => {
    const p1 = engine(1);
    expect(p1.verticalAvailable('marine', NG)).toBe(false);
    expect(p1.verticalAvailable('aviation', NG)).toBe(false);
    expect(p1.evaluate('module', 'dispatch', NG).available).toBe(true); // dispatch on from phase 1
    const p5 = engine(5);
    expect(p5.verticalAvailable('marine', NG)).toBe(true);
    expect(p5.evaluate('module', 'chat', NG).available).toBe(true);
  });

  it('dispatch / travel / security categories have independent switches', () => {
    const e = engine(4);
    // dispatch categories inherit logistics (on)…
    expect(e.evaluate('category', 'dispatch.bike', NG).available).toBe(true);
    // …until an admin flips one off
    e.upsertRule({ level: 'category', target: { kind: 'category', code: 'dispatch.courier' }, value: 'off', note: 'courier partner paused' });
    expect(e.evaluate('category', 'dispatch.courier', NG).available).toBe(false);
    expect(e.evaluate('category', 'dispatch.bike', NG).available).toBe(true); // sibling unaffected
    // travel + security category families resolve
    expect(e.evaluate('category', 'travel.domestic', NG).available).toBe(true);
    expect(e.evaluate('category', 'security.event', NG).available).toBe(true);
  });

  it('spec state/city examples: Edo travel off, Benin City security off, Asaba aviation off', () => {
    const e = engine(4);
    const benin = { country: 'NG', state: 'NG-ED', city: 'NG-BNI', userGroups: ['customers'] };
    expect(e.verticalAvailable('transportation', benin)).toBe(true);  // taxi ON
    expect(e.verticalAvailable('hotels', benin)).toBe(true);          // hotels ON
    expect(e.verticalAvailable('security', benin)).toBe(false);       // security OFF (city)
    expect(e.verticalAvailable('travel', benin)).toBe(false);         // travel OFF (state)
    expect(e.verticalAvailable('aviation', benin)).toBe(false);       // aviation OFF (state)
    const asaba = { country: 'NG', state: 'NG-DE', city: 'NG-ASB', userGroups: ['customers'] };
    expect(e.verticalAvailable('aviation', asaba)).toBe(false);
  });

  it('vendor lifecycle: 5 spec states map to engine values (disabled blocks hard)', () => {
    expect([...VENDOR_STATES]).toEqual(['active', 'suspended', 'pending_review', 'maintenance', 'disabled']);
    expect(VENDOR_STATE_VALUE.disabled).toBe('off');
    expect(VENDOR_STATE_VALUE.pending_review).toBe('hidden');
    const e = engine(4);
    e.upsertRule({ level: 'vendor', selector: 'vnd_x', target: { kind: 'vertical', code: 'transportation' }, value: VENDOR_STATE_VALUE.disabled, note: 'disabled by admin' });
    expect(e.evaluate('vertical', 'transportation', { ...NG, vendorId: 'vnd_x' }).available).toBe(false);
  });

  it('asset catalog covers the 8 spec classes incl. dispatch bikes, charter aircraft, yachts', () => {
    expect([...ASSET_TYPES]).toEqual(['car', 'motorcycle', 'dispatch_bike', 'helicopter', 'private_jet', 'charter_aircraft', 'boat', 'yacht']);
    const e = engine(4);
    e.upsertRule({ level: 'asset', selector: 'class:yacht', target: { kind: 'vertical', code: 'marine' }, value: 'off' });
    expect(e.evaluate('vertical', 'marine', { ...NG, assetId: 'class:yacht' }).available).toBe(false);
  });

  it('user groups: 7 spec groups; corporate portal flag can be scoped to corporate clients', () => {
    expect([...USER_GROUPS]).toEqual(['customers', 'drivers', 'riders', 'vendors', 'corporate', 'beta', 'vip']);
    const e = engine(4);
    e.upsertRule({ level: 'global', target: { kind: 'feature', code: 'portal.corp_pilot' }, value: 'off' });
    e.upsertRule({ level: 'global', target: { kind: 'feature', code: 'portal.corp_pilot' }, value: 'on', userGroups: ['corporate'] });
    expect(e.evaluate('feature', 'portal.corp_pilot', { country: 'NG', userGroups: ['customers'] }).available).toBe(false);
    expect(e.evaluate('feature', 'portal.corp_pilot', { country: 'NG', userGroups: ['corporate'] }).available).toBe(true);
  });

  it('middleware pipeline trace: location → country → state → city → feature flag → vendor → booking', () => {
    const e = engine(4);
    const trace = e.evaluatePipeline('vertical', 'aviation', { country: 'NG', state: 'NG-ED', city: 'NG-BNI', userGroups: ['customers'] });
    expect(trace.stages.map((s) => s.stage)).toEqual(['location', 'country', 'state', 'city', 'feature-flag', 'vendor', 'booking-engine']);
    expect(trace.decision.available).toBe(false);
    expect(trace.stages.at(-1)!.note).toBe(UNAVAILABLE_MESSAGE);
    const state = trace.stages.find((s) => s.stage === 'state')!;
    expect(state.value).toBe('off');
    expect(state.note).toMatch(/Edo/i);
  });
});
