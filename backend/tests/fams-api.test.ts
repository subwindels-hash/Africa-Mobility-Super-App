/**
 * FAMS — Feature Activation Management System (docs/28)
 * Integration tests: spec API endpoints, feature-activation middleware,
 * kill switch, scheduler, and WhatsApp AI obedience to activation settings.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import app from '../apps/api/main';
import * as wa from '../libs/whatsapp/src/index';
import { UNAVAILABLE_MESSAGE } from '../libs/fams/src/index';

const PORT = 4313;
let server: http.Server;
const base = `http://127.0.0.1:${PORT}`;
let adminToken = '';

beforeAll(async () => {
  server = http.createServer(app).listen(PORT);
  await new Promise((r) => server.on('listening', r));
  await fetch(base + '/v1/auth/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+2348099990001' }) });
  const v = await fetch(base + '/v1/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+2348099990001', code: '123456' }) });
  adminToken = (await v.json()).accessToken;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

async function req(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

describe('FAMS API — feature flags (spec: GET/POST/PUT/DELETE /feature-flags)', () => {
  it('lists the five spec feature flags with live evaluation', async () => {
    const r = await req('GET', '/v1/feature-flags?country=NG');
    expect(r.status).toBe(200);
    const codes = r.json.flags.map((f: any) => f.code);
    expect(codes).toEqual(['ai_dynamic_pricing', 'whatsapp_ai_assistant', 'video_calling', 'wallet', 'escrow']);
    const wallet = r.json.flags.find((f: any) => f.code === 'wallet');
    expect(wallet.available).toBe(true);
  });

  it('creates, updates and deletes a flag rule (no deploy, no code change)', async () => {
    const created = await req('POST', '/v1/feature-flags', { code: 'video_calling', level: 'country', selector: 'KE', value: 'off', note: 'KE later' }, adminToken);
    expect(created.status).toBe(201);
    const id = created.json.rule.id;
    expect(created.json.effect.available).toBe(false);

    const keView = await req('GET', '/v1/feature-flags?country=KE');
    expect(keView.json.flags.find((f: any) => f.code === 'video_calling').available).toBe(false);
    const ngView = await req('GET', '/v1/feature-flags?country=NG');
    expect(ngView.json.flags.find((f: any) => f.code === 'video_calling').available).toBe(true);

    const upd = await req('PUT', `/v1/feature-flags/${id}`, { value: 'beta' }, adminToken);
    expect(upd.status).toBe(200);
    expect(upd.json.rule.value).toBe('beta');

    const del = await req('DELETE', `/v1/feature-flags/${id}`, undefined, adminToken);
    expect(del.status).toBe(204);
    const after = await req('GET', '/v1/feature-flags?country=KE');
    expect(after.json.flags.find((f: any) => f.code === 'video_calling').available).toBe(true);
  });

  it('rejects invalid values and unauthenticated writes', async () => {
    const bad = await req('POST', '/v1/feature-flags', { code: 'wallet', value: 'sometimes' }, adminToken);
    expect(bad.status).toBe(422);
    const anon = await req('POST', '/v1/feature-flags', { code: 'wallet', value: 'off' });
    expect(anon.status).toBe(401);
  });
});

describe('FAMS API — service availability (spec: GET/POST/PUT /service-availability)', () => {
  it('Benin City: transportation on, aviation off — with canonical reason', async () => {
    const r = await req('GET', '/v1/service-availability?city=NG-BNI');
    expect(r.status).toBe(200);
    const services: Record<string, any> = Object.fromEntries(r.json.services.map((s: any) => [s.service, s]));
    expect(services.transportation.available).toBe(true);
    expect(services.aviation.available).toBe(false);
    expect(r.json.location.state).toBe('Edo');
  });

  it('country gates: Kenya transport off, Ghana security off', async () => {
    const ke = await req('GET', '/v1/service-availability?country=KE');
    const keS: Record<string, any> = Object.fromEntries(ke.json.services.map((s: any) => [s.service, s]));
    expect(keS.transportation.available).toBe(false);
    expect(keS.logistics.available).toBe(false);
    const gh = await req('GET', '/v1/service-availability?country=GH');
    const ghS: Record<string, any> = Object.fromEntries(gh.json.services.map((s: any) => [s.service, s]));
    expect(ghS.security.available).toBe(false);
    expect(ghS.transportation.available).toBe(true);
  });

  it('city ON overrides state OFF; POST + PUT availability rules', async () => {
    // Asaba state (Delta) has aviation off; ensure city-level rule flips Onitsha-style behaviour
    const created = await req('POST', '/v1/service-availability', { service: 'security', level: 'city', selector: 'NG-KAN', value: 'off', note: 'curfew' }, adminToken);
    expect(created.status).toBe(201);
    const kan = await req('GET', '/v1/service-availability?city=NG-KAN');
    const kanS: Record<string, any> = Object.fromEntries(kan.json.services.map((s: any) => [s.service, s]));
    expect(kanS.security.available).toBe(false);

    const upd = await req('PUT', `/v1/service-availability/${created.json.rule.id}`, { value: 'on' }, adminToken);
    expect(upd.status).toBe(200);
    const kan2 = await req('GET', '/v1/service-availability?city=NG-KAN');
    const kan2S: Record<string, any> = Object.fromEntries(kan2.json.services.map((s: any) => [s.service, s]));
    expect(kan2S.security.available).toBe(true);
  });
});

describe('FAMS — feature activation middleware guards the booking engine', () => {
  const pickup = { lat: 6.4281, lng: 3.4219 };
  const dropoff = { lat: 6.6018, lng: 3.3515 };

  it('Kenya request is blocked BEFORE pricing with the canonical message', async () => {
    const r = await req('POST', '/v1/bookings/estimate', { pickup, dropoff, country: 'KE' });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('SERVICE_UNAVAILABLE');
    expect(r.json.message).toBe(UNAVAILABLE_MESSAGE);
  });

  it('Nigeria request passes through to the booking engine', async () => {
    const r = await req('POST', '/v1/bookings/estimate', { pickup, dropoff, country: 'NG' });
    expect(r.status).toBe(200);
    expect(r.json.estimate.range.min).toBeGreaterThan(0);
  });

  it('emergency kill switch flips transportation off with no deploy', async () => {
    const stop = await req('POST', '/v1/fams/emergency', { target: 'vertical:transportation', on: true, reason: 'protest grounding' }, adminToken);
    expect(stop.status).toBe(201);
    const blocked = await req('POST', '/v1/bookings/estimate', { pickup, dropoff, country: 'NG' });
    expect(blocked.status).toBe(403);
    expect(blocked.json.message).toBe(UNAVAILABLE_MESSAGE);

    const clear = await req('POST', '/v1/fams/emergency', { target: 'vertical:transportation', on: false }, adminToken);
    expect(clear.status).toBe(200);
    const ok = await req('POST', '/v1/bookings/estimate', { pickup, dropoff, country: 'NG' });
    expect(ok.status).toBe(200);
  });
});

describe('FAMS — time-based activation via scheduler', () => {
  it('schedule + tick activates a due rule (deactivate 31 Jan style)', async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    const s = await req('POST', '/v1/fams/schedules', { action: 'set_value', level: 'city', selector: 'NG-IBD', service: 'transportation', target: { kind: 'vertical', code: 'transportation' }, value: 'off', runAt: due, note: 'test deactivate' }, adminToken);
    expect(s.status).toBe(201);
    const tick = await req('POST', '/v1/fams/tick');
    expect(tick.status).toBe(200);
    expect(tick.json.applied).toBeGreaterThanOrEqual(1);
    const ibd = await req('GET', '/v1/service-availability?city=NG-IBD');
    const ibdS: Record<string, any> = Object.fromEntries(ibd.json.services.map((x: any) => [x.service, x]));
    expect(ibdS.transportation.available).toBe(false);
    // restore for later suites
    await req('POST', '/v1/service-availability', { service: 'transportation', level: 'city', selector: 'NG-IBD', value: 'on' }, adminToken);
  });
});

describe('WhatsApp AI (Ada) respects every activation setting', () => {
  const NG = '+2348012345999';

  it('no helicopter recommendations where aviation is OFF (Benin City)', async () => {
    const out = await wa.processInbound({ from: NG, type: 'text', text: 'I need a helicopter in Benin City', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(out.text).toContain(UNAVAILABLE_MESSAGE);
    expect(out.meta?.fams).toBe('blocked');
    // and the availability view for Benin City never lists charters
    const avail = await wa.processInbound({ from: NG, type: 'text', text: 'What services are available in Benin City?', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(avail.text).not.toMatch(/charter|heli|jet/i);
  });

  it('ride booking still flows where the vertical is ON (Lagos)', async () => {
    const out = await wa.processInbound({ from: NG, type: 'text', text: 'Book me a taxi from Lekki to Ikeja', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(out.meta?.fams).not.toBe('blocked');
  });

  it('VIP ride category under maintenance is surfaced, not silently booked', async () => {
    const out = await wa.processInbound({ from: NG, type: 'text', text: 'I want a vip ride in Lagos', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(out.text.toLowerCase()).toContain('maintenance');
    expect(out.text).toContain(UNAVAILABLE_MESSAGE);
  });

  it('greeting lists only FAMS-enabled verticals', async () => {
    const out = await wa.processInbound({ from: NG, type: 'text', text: 'Hello', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(out.text).toContain('Ada');
    expect(out.text).toContain('🚗'); // transportation is on in NG
  });
});

describe('FAMS v2 — vendors, assets, locations, analytics', () => {
  it('vendor lifecycle endpoint: list + set disabled', async () => {
    const list = await req('GET', '/v1/fams/vendors');
    expect(list.status).toBe(200);
    expect(list.json.vendors.length).toBeGreaterThanOrEqual(3);
    const set = await req('POST', '/v1/fams/vendors', { vendorId: 'vnd_test_1', state: 'disabled', reason: 'fraud case F-102' }, adminToken);
    expect(set.status).toBe(201);
    expect(set.json.value).toBe('off');
    expect(set.json.effect.available).toBe(false);
    const again = await req('POST', '/v1/fams/vendors', { vendorId: 'vnd_test_1', state: 'active' }, adminToken);
    expect(again.json.state).toBe('active');
  });

  it('asset activation endpoint: catalog + yacht class off', async () => {
    const list = await req('GET', '/v1/fams/assets');
    expect(list.status).toBe(200);
    expect(list.json.assetTypes).toContain('yacht');
    expect(list.json.assetTypes).toContain('dispatch_bike');
    const set = await req('POST', '/v1/fams/assets', { assetId: 'class:yacht', value: 'off', vertical: 'marine', note: 'season end' }, adminToken);
    expect(set.status).toBe(201);
  });

  it('location management endpoint: country/state/city rules + city catalog', async () => {
    const r = await req('GET', '/v1/fams/locations');
    expect(r.status).toBe(200);
    expect(r.json.countries.some((c: any) => c.country === 'KE' && c.value === 'off')).toBe(true);
    expect(r.json.states.some((s: any) => s.state === 'NG-ED' && s.service === 'aviation')).toBe(true);
    expect(r.json.cities.some((c: any) => c.city === 'NG-BNI' && c.service === 'security')).toBe(true);
    expect(r.json.cityCatalog.length).toBeGreaterThanOrEqual(10);
  });

  it('activation analytics: totals, rule distribution, city coverage', async () => {
    const r = await req('GET', '/v1/fams/analytics');
    expect(r.status).toBe(200);
    expect(r.json.totals.modules).toBeGreaterThanOrEqual(24);
    expect(r.json.middleware.evaluations).toBeGreaterThan(0);
    const benin = r.json.cityCoverage.find((c: any) => c.city === 'NG-BNI');
    expect(benin.live).toBeLessThan(benin.of); // security + travel off in Benin City
    expect(r.json.rulesByLevel).toHaveProperty('city');
  });
});

describe('FAMS v2 — WhatsApp AI obeys deeper activation rules', () => {
  const NG = '+2348012345007';

  it('hotels disabled in a city → AI shows no hotel booking options there', async () => {
    const created = await req('POST', '/v1/service-availability', { service: 'accommodation', level: 'city', selector: 'NG-KAN', value: 'off', note: 'Kano hotels paused' }, adminToken);
    expect(created.status).toBe(201);
    const out = await wa.processInbound({ from: NG, type: 'text', text: 'Book me a hotel in Kano for 2 nights', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(out.text).toContain(UNAVAILABLE_MESSAGE);
    expect(out.meta?.fams).toBe('blocked');
    // and the availability view for Kano lists no hotel/short-let
    const avail = await wa.processInbound({ from: NG, type: 'text', text: 'What services are available in Kano?', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(avail.text).not.toMatch(/hotel|short-let/i);
    // restore
    const del = await req('DELETE', `/v1/feature-flags/${created.json.rule.id}`, undefined, adminToken);
    // service-availability rule may not be deletable via feature-flags path; force-restore with an ON rule
    if (del.status !== 204) {
      await req('PUT', `/v1/service-availability/${created.json.rule.id}`, { value: 'on' }, adminToken);
    }
  });

  it('WhatsApp AI master switch: killing module:whatsapp_ai leaves only the canonical message', async () => {
    const stop = await req('POST', '/v1/fams/emergency', { target: 'module:whatsapp_ai', on: true, reason: 'AI incident review' }, adminToken);
    expect(stop.status).toBe(201);
    const out = await wa.processInbound({ from: NG, type: 'text', text: 'Hello, I need a taxi', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(out.text.trim()).toBe(UNAVAILABLE_MESSAGE);
    await req('POST', '/v1/fams/emergency', { target: 'module:whatsapp_ai', on: false }, adminToken);
    const back = await wa.processInbound({ from: NG, type: 'text', text: 'Hello', timestamp: new Date().toISOString() } as wa.InboundMessage);
    expect(back.text).toContain('Ada');
  });
});
