import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import app from '../apps/api/main';

const PORT = 4311;
let server: http.Server;
const base = `http://127.0.0.1:${PORT}`;

beforeAll(async () => {
  server = http.createServer(app).listen(PORT);
  await new Promise((r) => server.on('listening', r));
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe('AMSA API — booking → escrow → settlement E2E', () => {
  const pickup = { lat: 6.4281, lng: 3.4219, label: 'Victoria Island' };
  const dropoff = { lat: 6.6018, lng: 3.3515, label: 'Ikeja City Mall' };

  it('health is green', async () => {
    const res = await fetch(base + '/v1/health');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('OTP flow issues a session', async () => {
    const r1 = await post('/v1/auth/otp', { phone: '+2348012345678' });
    expect(r1.status).toBe(201);
    const r2 = await post('/v1/auth/verify', { phone: '+2348012345678', code: '123456' });
    expect(r2.status).toBe(200);
    expect(r2.json.accessToken).toMatch(/^tok_/);
  });

  it('estimate returns guardrailed surge and a range', async () => {
    const { status, json } = await post('/v1/bookings/estimate', { pickup, dropoff, surgeMultiplier: 5 });
    expect(status).toBe(200);
    expect(json.estimate.surge).toBeLessThanOrEqual(2.0);
    expect(json.estimate.range.min).toBeLessThan(json.estimate.range.max);
  });

  it('full lifecycle: create → accept → start → complete with escrow settlement', async () => {
    const login = await post('/v1/auth/verify', { phone: '+2348012345678', code: '123456' });
    const token = login.json.accessToken;

    const create = await post('/v1/bookings', { pickup, dropoff }, token);
    expect(create.status).toBe(201);
    expect(create.json.status).toBe('requested');
    const id = create.json.id;

    const accept = await post(`/v1/bookings/${id}/accept`, {}, token);
    expect(accept.status).toBe(200);
    expect(accept.json.status).toBe('confirmed');
    expect(accept.json.escrow.state).toBe('held');
    expect(accept.json.escrow.badge).toContain('protected');

    const badOtp = await post(`/v1/bookings/${id}/start`, { otp: '0000' }, token);
    expect(badOtp.status).toBe(422);

    const start = await post(`/v1/bookings/${id}/start`, { otp: '4758' }, token);
    expect(start.status).toBe(200);
    expect(start.json.status).toBe('in_progress');
    expect(start.json.safety.sos).toBeTruthy();

    const complete = await post(`/v1/bookings/${id}/complete`, {}, token);
    expect(complete.status).toBe(200);
    expect(complete.json.status).toBe('settled');
    const r = complete.json.receipt;
    expect(r.commission.amount + r.vat.amount + r.vendorNet.amount).toBe(r.gross.amount);
    expect(complete.json.escrow.state).toBe('released');
  });

  it('double completion is rejected (illegal state)', async () => {
    const login = await post('/v1/auth/verify', { phone: '+2348012345678', code: '123456' });
    const token = login.json.accessToken;
    const create = await post('/v1/bookings', { pickup, dropoff }, token);
    const id = create.json.id;
    await post(`/v1/bookings/${id}/accept`, {}, token);
    await post(`/v1/bookings/${id}/start`, { otp: '4758' }, token);
    await post(`/v1/bookings/${id}/complete`, {}, token);
    const again = await post(`/v1/bookings/${id}/complete`, {}, token);
    expect(again.status).toBe(409);
    expect(again.json.code).toBe('ILLEGAL_STATE');
  });

  it('booking without token is 401', async () => {
    const { status, json } = await post('/v1/bookings', { pickup, dropoff });
    expect(status).toBe(401);
    expect(json.code).toBe('AUTH_REQUIRED');
  });
});
