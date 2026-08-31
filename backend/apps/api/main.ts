/**
 * AMSA API (runtime demo of the domain core).
 *
 * Production topology is the microservices catalog in docs/08; this runnable
 * service exposes the same domain modules behind one HTTP surface so the
 * booking → escrow → settlement flow can be exercised end-to-end:
 *
 *   POST /v1/auth/otp        → get OTP
 *   POST /v1/auth/verify     → login (returns token)
 *   POST /v1/bookings/estimate
 *   POST /v1/bookings        → create + auto-dispatch simulation
 *   POST /v1/bookings/:id/accept   (vendor accepts)
 *   POST /v1/bookings/:id/start    (OTP pickup verify)
 *   POST /v1/bookings/:id/complete (finalize fare + escrow release + settlement)
 *   GET  /v1/bookings/:id
 *   GET  /v1/wallets/me
 *   GET  /v1/health
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import * as core from '../../libs/core/src/index';
import * as wa from '../../libs/whatsapp/src/index';

interface AppUser {
  id: string; phone: string; role: 'customer' | 'driver' | 'vendor'; name: string;
  vendorId?: string;
}

// --- in-memory stores (swap for repositories over PostgreSQL in deployment) ---
const users = new Map<string, AppUser>();
const otps = new Map<string, string>();
const sessions = new Map<string, string>(); // token -> userId
const bookings = new Map<string, any>();
const escrows = new Map<string, core.EscrowHold>();
const allJournal: core.JournalEntry[] = [];

const app = express();
app.use(express.json());

const problem = (res: Response, status: number, code: string, message: string, details?: unknown) =>
  res.status(status).json({ type: 'about:blank', title: code, status, code, message, details, traceId: `tr_${Math.random().toString(36).slice(2, 10)}` });

// --- auth-lite (demo): OTP fixed at 123456, HMAC-ish opaque token ---
app.post('/v1/auth/otp', (req, res) => {
  const { phone } = req.body ?? {};
  if (!phone || !/^\+?[0-9]{7,15}$/.test(String(phone))) return problem(res, 422, 'VALIDATION_FAILED', 'Valid phone required', { field: 'phone' });
  otps.set(phone, '123456');
  res.status(201).json({ sent: true, channel: 'sms', expiresInSec: 300, hint: 'demo OTP is 123456' });
});

app.post('/v1/auth/verify', (req, res) => {
  const { phone, code } = req.body ?? {};
  if (otps.get(phone) !== code) return problem(res, 401, 'AUTH_REQUIRED', 'Invalid OTP');
  const id = `usr_${phone.slice(-4)}`;
  if (!users.has(id)) users.set(id, { id, phone, role: 'customer', name: `User ${phone.slice(-4)}` });
  const token = `tok_${Buffer.from(`${id}:${Date.now()}`).toString('base64url')}`;
  sessions.set(token, id);
  res.json({ accessToken: token, expiresInSec: 900, user: users.get(id) });
});

const auth = (req: Request, res: Response, next: NextFunction) => {
  const h = String(req.headers.authorization ?? '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const uid = token && sessions.get(token);
  if (!uid) return problem(res, 401, 'AUTH_REQUIRED', 'Missing or invalid token');
  (req as any).userId = uid;
  next();
};

// --- catalog of drivers for dispatch simulation ---
const DRIVERS: core.Candidate[] = [
  { id: 'drv_1', location: { lat: 6.4281, lng: 3.4219 }, rating: 4.9, acceptanceRate: 0.95, completionRate: 0.99, classFit: true, capacityOk: true, subscriptionTier: 'professional', onlineMinutes: 180, fraudRisk: 0.02 },
  { id: 'drv_2', location: { lat: 6.4330, lng: 3.4100 }, rating: 4.6, acceptanceRate: 0.88, completionRate: 0.97, classFit: true, capacityOk: true, subscriptionTier: 'standard', onlineMinutes: 40, fraudRisk: 0.05 },
  { id: 'drv_3', location: { lat: 6.4500, lng: 3.4500 }, rating: 4.2, acceptanceRate: 0.7, completionRate: 0.92, classFit: true, capacityOk: true, subscriptionTier: 'free', onlineMinutes: 10, fraudRisk: 0.1 },
];

app.post('/v1/bookings/estimate', (req, res) => {
  const { pickup, dropoff, stops, surgeMultiplier } = req.body ?? {};
  if (!pickup?.lat || !dropoff?.lat) return problem(res, 422, 'VALIDATION_FAILED', 'pickup and dropoff required');
  const breakdown = core.computeFare({ pickup, dropoff, stops, surgeMultiplier });
  res.json({ estimate: { ...breakdown, etaPickupSec: 240 }, surgeTransparency: { multiplier: breakdown.surge, cap: core.DEFAULT_RULE.surgeCap, reason: 'high demand' } });
});

app.post('/v1/bookings', auth, (req: any, res) => {
  const { pickup, dropoff, stops, scheduledAt } = req.body ?? {};
  if (!pickup?.lat || !dropoff?.lat) return problem(res, 422, 'VALIDATION_FAILED', 'pickup and dropoff required');
  const id = `bkg_${Math.random().toString(36).slice(2, 10)}`;
  const breakdown = core.computeFare({ pickup, dropoff, stops });
  const shortlist = core.rankCandidates(DRIVERS, { pickup, top: 5 });
  const booking = {
    id, customerId: req.userId, status: 'requested' as core.BookingStatus,
    type: scheduledAt ? 'scheduled' : 'instant',
    pickup, dropoff, stops: stops ?? [],
    quote: breakdown, driverId: null as string | null,
    createdAt: new Date().toISOString(),
  };
  bookings.set(id, booking);
  res.status(201).json({
    id, status: booking.status,
    priceEstimate: { min: breakdown.range.min, max: breakdown.range.max, currency: breakdown.currency, confidence: 0.86, surge: breakdown.surge },
    dispatch: { shortlist: shortlist.map((d) => d.id), offerTtlSec: 15 },
    traceId: `tr_${Math.random().toString(36).slice(2, 10)}`,
  });
});

const getBooking = (req: Request, res: Response): any | null => {
  const b = bookings.get(req.params.id);
  if (!b) { problem(res, 404, 'NOT_FOUND', 'Booking not found'); return null; }
  return b;
};

app.post('/v1/bookings/:id/accept', (req, res) => {
  const b = getBooking(req, res); if (!b) return;
  try {
    core.assertTransition(b.status, 'matched');
    const shortlist = core.rankCandidates(DRIVERS, { pickup: b.pickup, top: 1 });
    b.status = 'matched';
    b.driverId = shortlist[0]?.id ?? 'drv_1';
    // escrow: authorize → fund → booking confirmed
    const hold = core.openEscrow({ bookingId: b.id, customer: b.customerId, vendor: b.driverId!, total: { amount: b.quote.total, currency: 'NGN' as const } });
    core.fund(hold); core.beginService(hold);
    escrows.set(b.id, hold);
    core.assertTransition(b.status, 'confirmed');
    b.status = 'confirmed';
    res.json({ id: b.id, status: b.status, driver: b.driverId, escrow: { state: hold.state, total: hold.total, badge: '🔒 funds protected' } });
  } catch (e: any) { return problem(res, 409, 'ILLEGAL_STATE', e.message); }
});

app.post('/v1/bookings/:id/start', (req, res) => {
  const b = getBooking(req, res); if (!b) return;
  const { otp } = req.body ?? {};
  if (String(otp) !== '4758') return problem(res, 422, 'VALIDATION_FAILED', 'Pickup OTP invalid (demo: 4758)');
  try {
    core.assertTransition(b.status, 'en_route');
    b.status = 'en_route';
    core.assertTransition(b.status, 'in_progress');
    b.status = 'in_progress';
    res.json({ id: b.id, status: b.status, tracking: 'live', safety: { sos: '2-tap reachable', shareLink: `https://share.amsa.africa/${b.id}` } });
  } catch (e: any) { return problem(res, 409, 'ILLEGAL_STATE', e.message); }
});

app.post('/v1/bookings/:id/complete', (req, res) => {
  const b = getBooking(req, res); if (!b) return;
  const hold = escrows.get(b.id);
  if (!hold) return problem(res, 409, 'ILLEGAL_STATE', 'No escrow on booking');
  try {
    core.assertTransition(b.status, 'completed');
    b.status = 'completed';
    const { hold: h, split } = core.releaseOnCompletion(hold, 'completed', core.DEFAULT_RULE, { extraWaitMinutes: 0, extraStops: 0 });
    allJournal.push(...h.journal);
    core.assertEscrowIntegrity(h);
    core.assertTransition(b.status, 'settled');
    b.status = 'settled';
    res.json({
      id: b.id, status: b.status,
      receipt: { gross: split.gross, commission: split.commission, vat: split.vat, vendorNet: split.vendorNet },
      escrow: { state: h.state, released: h.released },
    });
  } catch (e: any) { return problem(res, 409, 'ILLEGAL_STATE', e.message); }
});

app.get('/v1/bookings/:id', (req, res) => {
  const b = getBooking(req, res); if (!b) return;
  res.json({ ...b, escrow: escrows.get(b.id) ? { state: escrows.get(b.id)!.state } : null });
});

app.get('/v1/wallets/me', auth, (req: any, res) => {
  const mine = allJournal.filter((e) => e.lines.some((l) => l.accountId.includes(req.userId)));
  const vendorBal = core.accountBalance(allJournal, `vendor:${req.userId}`);
  const custBal = core.accountBalance(allJournal, `customer:${req.userId}`);
  res.json({ userId: req.userId, balances: [...vendorBal, ...custBal], entries: mine.length });
});

app.get('/v1/health', (_req, res) => res.json({ ok: true, service: 'amsa-api', version: '1.1.0', time: new Date().toISOString() }));

// ─── WhatsApp Smart AI Customer Service Platform (docs/26) ──────────────────
app.get('/webhooks/whatsapp', wa.verifyWebhook);
app.post('/webhooks/whatsapp', express.raw({ type: '*/*' }) as any, (req, res) => {
  // body may arrive as raw buffer when signature middleware is enabled
  if (Buffer.isBuffer(req.body)) {
    try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
  }
  wa.webhookInbound(req, res);
});

/** Simulator: play a customer message through the AI without Meta. */
app.post('/v1/whatsapp/simulate', async (req, res) => {
  const { from, text, type, location, mediaId } = req.body ?? {};
  if (!from) return problem(res, 422, 'VALIDATION_FAILED', 'from (phone) required');
  const out = await wa.processInbound({
    from, type: type ?? 'text', text, location, mediaId,
    timestamp: new Date().toISOString(),
  } as wa.InboundMessage);
  res.json({ reply: out.text, meta: out.meta });
});

/** Conversation state + history (admin/ops view). */
app.get('/v1/whatsapp/sessions/:phone', (req, res) => {
  const s = wa.sessionStore.get(req.params.phone);
  if (!s) return problem(res, 404, 'NOT_FOUND', 'No conversation for this number');
  res.json({ phone: s.phone, language: s.language, node: s.node, escalated: s.escalated, draft: s.draft, history: s.history.slice(-20) });
});

app.get('/v1/whatsapp/stats', (_req, res) => res.json(wa.stats));

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.RUN_SERVER === '1') {
  app.listen(PORT, '0.0.0.0', () => console.log(`AMSA API listening on :${PORT}`));
}
export default app;
