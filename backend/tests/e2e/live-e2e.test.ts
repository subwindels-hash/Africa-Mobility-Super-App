/**
 * Live E2E suite — runs against REAL running services (not mocks):
 *   API  http://localhost:4000  (RUN_SERVER=1 npm run dev)
 *   Web  http://localhost:3000  (npm run start)
 *
 * Gated by RUN_E2E=1 so CI/unit runs stay hermetic:
 *   RUN_E2E=1 npx vitest run tests/e2e/live-e2e.test.ts
 *
 * Covers: API health → OTP auth → authorized wallet → rides estimate →
 * geo routing → travel GDS offers → interstate quote → FAMS health →
 * feature flags, plus every web route rendering server-side.
 */
import { describe, it, expect } from 'vitest';

const RUN = process.env.RUN_E2E === '1';
const API = process.env.E2E_API ?? 'http://localhost:4000';
const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';

const post = (path: string, body: unknown, token?: string) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
const get = (path: string, token?: string) =>
  fetch(`${API}${path}`, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);

describe.skipIf(!RUN)('live API end-to-end', () => {
  it('health reports ok', async () => {
    const r = await get('/v1/health');
    expect(r.status).toBe(200);
    const j: any = await r.json();
    expect(j.ok).toBe(true);
    expect(j.service).toBe('amsa-api');
  });

  it('rejects invalid OTP phone upfront (422 problem+json)', async () => {
    const r = await post('/v1/auth/otp', { phone: 'nope' });
    expect(r.status).toBe(422);
    const j: any = await r.json();
    expect(j.code).toBe('VALIDATION_FAILED');
  });

  it('full rider journey: OTP → verify → token → estimate → wallet', async () => {
    const phone = '+2348012345678';
    const otpR = await post('/v1/auth/otp', { phone });
    expect(otpR.status).toBeLessThan(300);

    const vR = await post('/v1/auth/verify', { phone, code: '123456' });
    expect(vR.status).toBe(200);
    const v: any = await vR.json();
    const token = v.token ?? v.accessToken ?? v.session?.token;
    expect(token).toBeTruthy();

    const eR = await post('/v1/bookings/estimate', {
      pickup: { lat: 6.5244, lng: 3.3792, label: 'Ikeja' },
      dropoff: { lat: 6.4541, lng: 3.3947, label: 'Victoria Island' },
      service: 'ride.standard',
    });
    expect(eR.status).toBe(200);
    const est: any = await eR.json();
    const e = est.estimate ?? est;
    expect(Number(e.distance ?? e.distanceMeters ?? e.total ?? 0)).toBeGreaterThan(0);

    const wR = await get('/v1/wallets/me', token);
    expect(wR.status).toBe(200);
    const w: any = await wR.json();
    expect(w).toBeTruthy();
  });

  it('wrong OTP code is rejected', async () => {
    const phone = '+2348012345679';
    await post('/v1/auth/otp', { phone });
    const r = await post('/v1/auth/verify', { phone, code: '000000' });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('geo routing computes Lagos → Abuja', async () => {
    const r = await get('/v1/geo/route?origin=6.5244,3.3792&destination=9.0579,7.4911');
    expect(r.status).toBe(200);
    const j: any = await r.json();
    expect(Number(j.distanceKm ?? j.distance_m / 1000)).toBeGreaterThan(400); // Lagos–Abuja ≈ 527 km
  });

  it('travel GDS returns bookable offers', async () => {
    const r = await post('/v1/travel/search', {
      origin: 'LOS',
      destination: 'ABV',
      departDate: '2026-09-15',
      passengers: 1,
    });
    expect(r.status).toBe(200);
    const j: any = await r.json();
    const offers = j.offers ?? j.data ?? [];
    expect(offers.length).toBeGreaterThan(0);
  });

  it('interstate quote prices a Lagos → Kano FTL shipment', async () => {
    const r = await post('/v1/interstate/quote', {
      service: 'ftl',
      originState: 'NG-LAG',
      destinationState: 'NG-KAN',
      cargo: { weightKg: 12_000, category: 'general' },
    });
    expect(r.status).toBe(200);
    const j: any = await r.json();
    const offers = j.offers ?? [];
    const minor = offers[0]?.priceMinor ?? j.totalMinor ?? j.quote?.totalMinor;
    expect(offers.length).toBeGreaterThan(0);
    expect(Number(minor)).toBeGreaterThan(0);
  });

  it('interstate catalog lists corridors + vehicle categories', async () => {
    const r = await get('/v1/interstate/catalog');
    expect(r.status).toBe(200);
    const j: any = await r.json();
    const cats = j.services ?? j.vehicleCategories ?? j.categories ?? j.data?.vehicleCategories ?? [];
    expect(cats.length).toBeGreaterThan(0);
  });

  it('FAMS health + feature flags respond', async () => {
    const h = await get('/v1/fams/health');
    expect(h.status).toBe(200);
    const f = await get('/v1/feature-flags');
    expect(f.status).toBe(200);
  });
});

describe.skipIf(!RUN)('live web app renders all routes', () => {
  const routes: Array<[string, string]> = [
    ['/', 'Africa Mobility'],
    ['/wallet', 'escrow'],
    ['/vendor', 'vendor'],
    ['/vendor/onboarding', 'step'],
    ['/book', 'book'],
    ['/track', 'track'],
    ['/corporate', 'corporate'],
    ['/admin', 'admin'],
    ['/admin/fams', 'fams'],
    ['/admin/interstate', 'interstate'],
    ['/admin/mobility', 'mobility'],
    ['/admin/organism', 'organism'],
    ['/admin/shield', 'shield'],
    ['/admin/whatsapp', 'whatsapp'],
  ];

  for (const [path, marker] of routes) {
    it(`GET ${path} → 200 with "${marker}"`, async () => {
      const r = await fetch(`${WEB}${path}`);
      expect(r.status).toBe(200);
      const html = (await r.text()).toLowerCase();
      expect(html).toContain(marker.toLowerCase());
    });
  }

  it('unknown route → 404', async () => {
    const r = await fetch(`${WEB}/definitely-not-a-route`);
    expect(r.status).toBe(404);
  });
});
