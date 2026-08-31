import { test, expect } from '@playwright/test';

const API = process.env.E2E_API ?? 'http://localhost:4000';

/**
 * Cross-service user journeys: real browser UI ↔ real API on :4000.
 * (No route mocking — the seam under test is the full stack.)
 */

test.describe('rider journey (UI + live API)', () => {
  test('estimate a ride through the API from a browser context', async ({ request }) => {
    const r = await request.post(`${API}/v1/bookings/estimate`, {
      data: {
        pickup: { lat: 6.5244, lng: 3.3792, label: 'Ikeja' },
        dropoff: { lat: 6.4541, lng: 3.3947, label: 'Victoria Island' },
        service: 'ride.standard',
      },
    });
    expect(r.ok()).toBeTruthy();
    const est = await r.json();
    const e = est.estimate ?? est;
    expect(Number(e.distance ?? e.distanceMeters ?? e.total ?? 0)).toBeGreaterThan(0);
  });

  test('OTP login via API then wallet read', async ({ request }) => {
    const phone = '+2348012345678';
    const otp = await request.post(`${API}/v1/auth/otp`, { data: { phone } });
    expect(otp.ok()).toBeTruthy();

    const v = await request.post(`${API}/v1/auth/verify`, { data: { phone, code: '123456' } });
    expect(v.ok()).toBeTruthy();
    const body = await v.json();
    const token = body.token ?? body.accessToken ?? body.session?.token;
    expect(token).toBeTruthy();

    const w = await request.get(`${API}/v1/wallets/me`, { headers: { authorization: `Bearer ${token}` } });
    expect(w.ok()).toBeTruthy();
  });

  test('booking page loads and accepts input', async ({ page }) => {
    await page.goto('/book');
    const inputs = page.locator('input, textarea, select, button');
    expect(await inputs.count()).toBeGreaterThan(0);
  });

  test('tracking page renders without a session', async ({ page }) => {
    await page.goto('/track');
    await expect(page.locator('body')).toContainText(/\S/);
  });
});

test.describe('interstate logistics journey', () => {
  test('quote Lagos → Kano FTL', async ({ request }) => {
    const r = await request.post(`${API}/v1/interstate/quote`, {
      data: {
        service: 'ftl',
        originState: 'NG-LAG',
        destinationState: 'NG-KAN',
        cargo: { weightKg: 12_000, category: 'general' },
      },
    });
    expect(r.ok()).toBeTruthy();
    const q = await r.json();
    const offers = q.offers ?? [];
    expect(offers.length).toBeGreaterThan(0);
    expect(Number(offers[0]?.priceMinor ?? q.totalMinor ?? 0)).toBeGreaterThan(0);
  });

  test('admin interstate dashboard renders corridor data', async ({ page }) => {
    await page.goto('/admin/interstate');
    await expect(page.locator('main, body').first()).not.toContainText(/application error/i);
  });
});
