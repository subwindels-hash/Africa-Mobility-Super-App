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
 *
 * FAMS — Feature Activation Management System (docs/28), no deploy needed:
 *   GET/POST /v1/feature-flags · PUT/DELETE /v1/feature-flags/:id
 *   GET/POST /v1/service-availability · PUT /v1/service-availability/:id
 *   GET/POST /v1/fams/emergency      (kill switch)
 *   GET/POST /v1/fams/schedules · POST /v1/fams/tick (time-based activation)
 *   GET  /v1/fams/rules · /v1/fams/health
 *   → Feature Activation Middleware guards /v1/bookings* (403 + canonical message)
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import * as core from '../../libs/core/src/index';
import * as wa from '../../libs/whatsapp/src/index';
import {
  FamsEngine, type FamsRule, type FamsValue, type FamsLevel, type FamsContext, type FamsTargetKind,
  PLATFORM_MODULES, VERTICAL_MODULE, CATEGORY_VERTICAL, PHASES,
  CITY_STATE, STATE_NAMES, countryFromPhone, UNAVAILABLE_MESSAGE, ensureSeeded,
} from '../../libs/fams/src/index';

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

// ─── FAMS — Feature Activation Management System (docs/28) ───────────────────
// Admins activate/deactivate/hide/roll out services, locations, features, vendors
// and assets WITHOUT software updates. The engine gates every request:
//   User Request → Feature Activation Engine → Location Validation →
//   Feature Flag Validation → Vendor Availability Validation → Booking Engine
const fams = ensureSeeded();

/** Parse a FAMS context from query/body (location validation). */
function famsCtxFrom(src: Record<string, any>): FamsContext {
  const city = typeof src?.city === 'string' ? src.city : undefined;
  const state = typeof src?.state === 'string' ? src.state : city ? CITY_STATE[city] : undefined;
  return {
    country: typeof src?.country === 'string' ? src.country : 'NG',
    state, city,
    vendorId: src?.vendorId, assetId: src?.assetId,
    userGroups: Array.isArray(src?.userGroups) ? src.userGroups : ['customers'],
    userId: src?.userId,
  };
}

/**
 * Feature Activation Middleware — wraps the booking engine. When the engine
 * says OFF the caller gets the canonical message and a 403 — before pricing,
 * dispatch or escrow.
 */
const famsMiddleware = (vertical = 'transportation') => (req: Request, res: Response, next: NextFunction) => {
  const ctx = famsCtxFrom(req.body ?? {});
  const decision = fams.evaluate('vertical', vertical, ctx);
  if (!decision.available) {
    return problem(res, 403, 'SERVICE_UNAVAILABLE', UNAVAILABLE_MESSAGE, { service: vertical, context: ctx, decision });
  }
  (req as any).fams = { decision, ctx };
  next();
};
app.use(['/v1/bookings', '/v1/bookings/estimate'], famsMiddleware('transportation'));

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

// ─── FAMS — Feature Activation Management System (docs/28) ───────────────────
// Admins activate/deactivate/hide/roll out services, locations, features, vendors
// and assets WITHOUT software updates. The engine below gates every request:
//   User Request → Feature Activation Engine → Location Validation →
//   Feature Flag Validation → Vendor Availability Validation → Booking Engine
const FAMS_VALUES: FamsValue[] = ['on', 'off', 'hidden', 'maintenance', 'beta'];
const FAMS_LEVELS: FamsLevel[] = ['global', 'country', 'state', 'city', 'category', 'vendor', 'asset'];

function parseRuleBody(body: any, res: Response): Partial<FamsRule> | null {
  const value = body?.value as FamsValue;
  const level = body?.level as FamsLevel;
  if (!value || !FAMS_VALUES.includes(value)) { problem(res, 422, 'VALIDATION_FAILED', `value must be one of ${FAMS_VALUES.join('|')}`); return null; }
  if (level !== undefined && !FAMS_LEVELS.includes(level)) { problem(res, 422, 'VALIDATION_FAILED', `level must be one of ${FAMS_LEVELS.join('|')}`); return null; }
  if (!body?.target?.kind || !body?.target?.code) { problem(res, 422, 'VALIDATION_FAILED', 'target {kind: module|vertical|category|feature, code} required'); return null; }
  return {
    level: level ?? 'global', selector: body.selector,
    target: { kind: body.target.kind as FamsTargetKind, code: String(body.target.code) },
    value,
    userGroups: body.userGroups, rolloutPct: body.rolloutPct,
    startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
    endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    geofence: body.geofence, note: body.note, updatedBy: body.updatedBy ?? 'admin_api',
  };
}

/** Feature-flag routes — spec: GET/POST/PUT/DELETE /feature-flags. */
app.get('/v1/feature-flags', (req, res) => {
  const ctx = famsCtxFrom(req.query as any);
  const flags = ['ai_dynamic_pricing', 'whatsapp_ai_assistant', 'video_calling', 'wallet', 'escrow'];
  const rules = fams.listRules().filter((r) => r.target.kind === 'feature');
  res.json({
    flags: flags.map((code) => ({ code, ...fams.evaluate('feature', code, ctx) })),
    rules,
    context: ctx,
  });
});

app.post('/v1/feature-flags', auth, (req: any, res) => {
  const parsed = parseRuleBody({ ...req.body, target: { kind: 'feature', code: req.body?.code ?? req.body?.target?.code } }, res);
  if (!parsed) return;
  const rule = fams.upsertRule(parsed as any);
  const effectCtx = famsCtxFrom({
    ...req.body,
    country: rule.level === 'country' ? rule.selector : req.body?.country,
    state: rule.level === 'state' ? rule.selector : undefined,
    city: rule.level === 'city' ? rule.selector : undefined,
  });
  res.status(201).json({ rule, effect: fams.evaluate('feature', rule.target.code, effectCtx) });
});

app.put('/v1/feature-flags/:id', auth, (req: any, res) => {
  const existing = fams.listRules().find((r) => r.id === req.params.id);
  if (!existing) return problem(res, 404, 'NOT_FOUND', 'Feature flag rule not found');
  const parsed = parseRuleBody({ ...existing, ...req.body, target: existing.target }, res);
  if (!parsed) return;
  const rule = fams.upsertRule({ ...(parsed as any), id: existing.id, updatedBy: req.body?.updatedBy ?? 'admin_api' });
  res.json({ rule });
});

app.delete('/v1/feature-flags/:id', auth, (req: any, res) => {
  const ok = fams.deleteRule(req.params.id);
  if (!ok) return problem(res, 404, 'NOT_FOUND', 'Feature flag rule not found');
  res.status(204).end();
});

/** Service availability — spec: GET/POST/PUT /service-availability. */
app.get('/v1/service-availability', (req, res) => {
  const ctx = famsCtxFrom(req.query as any);
  const verticals = ['transportation', 'logistics', 'travel', 'aviation', 'security', 'accommodation', 'roadside', 'corporate_services'];
  const matrix = fams.availabilityMatrix(ctx, verticals);
  res.json({
    context: ctx,
    location: { city: ctx.city, state: ctx.state ? STATE_NAMES[ctx.state] ?? ctx.state : undefined, country: ctx.country },
    services: Object.entries(matrix).map(([code, d]) => ({
      service: code, ...d,
    })),
    features: ['ai_dynamic_pricing', 'whatsapp_ai_assistant', 'video_calling', 'wallet', 'escrow']
      .map((code) => ({ service: code, ...fams.evaluate('feature', code, ctx) })),
  });
});

app.post('/v1/service-availability', auth, (req: any, res) => {
  const parsed = parseRuleBody({ level: 'city', ...req.body, target: { kind: 'vertical', code: req.body?.service ?? req.body?.target?.code } }, res);
  if (!parsed) return;
  const rule = fams.upsertRule(parsed as any);
  res.status(201).json({ rule, effect: fams.evaluate('vertical', rule.target.code, famsCtxFrom({ ...req.body, city: rule.level === 'city' ? rule.selector : req.body?.city })) });
});

app.put('/v1/service-availability/:id', auth, (req: any, res) => {
  const existing = fams.listRules().find((r) => r.id === req.params.id);
  if (!existing) return problem(res, 404, 'NOT_FOUND', 'Availability rule not found');
  const parsed = parseRuleBody({ ...existing, ...req.body, target: existing.target }, res);
  if (!parsed) return;
  const rule = fams.upsertRule({ ...(parsed as any), id: existing.id, updatedBy: req.body?.updatedBy ?? 'admin_api' });
  res.json({ rule });
});

/** Full rule catalog + reference data (dashboard source of truth). */
app.get('/v1/fams/rules', (_req, res) => {
  res.json({
    rules: fams.listRules(),
    modules: PLATFORM_MODULES,
    verticalModule: VERTICAL_MODULE,
    categoryVertical: CATEGORY_VERTICAL,
    phases: PHASES,
    cities: Object.keys(CITY_STATE).map((city) => ({ code: city, state: CITY_STATE[city], stateName: STATE_NAMES[CITY_STATE[city]] })),
  });
});

/** Emergency kill switch — instant, no deploy. */
app.get('/v1/fams/emergency', (_req, res) => res.json({ active: fams.listEmergencies() }));

app.post('/v1/fams/emergency', auth, (req: any, res) => {
  const { target, on = true, by, reason } = req.body ?? {};
  if (!target || !/:/.test(String(target))) return problem(res, 422, 'VALIDATION_FAILED', 'target required as kind:code, e.g. vertical:aviation');
  fams.setEmergency(String(target), Boolean(on), by ?? req.userId, reason ?? 'emergency shutdown');
  res.status(on ? 201 : 200).json({ target, on: Boolean(on), active: fams.listEmergencies().map((e) => e.targetKey) });
});

/** Scheduled activations (time-based) + scheduler tick. */
app.get('/v1/fams/schedules', (_req, res) => res.json({ schedules: fams.listSchedules() }));

app.post('/v1/fams/schedules', auth, (req: any, res) => {
  const b = req.body ?? {};
  if (!b.runAt || !b.target?.code) return problem(res, 422, 'VALIDATION_FAILED', 'runAt and target.code required');
  const s = fams.schedule({
    action: b.action ?? 'set_value',
    level: b.level ?? 'global', selector: b.selector,
    target: { kind: b.target.kind ?? 'vertical', code: String(b.target.code) },
    value: b.value, runAt: new Date(b.runAt), note: b.note,
  } as any);
  res.status(201).json({ schedule: s });
});

app.post('/v1/fams/tick', (_req, res) => {
  const applied = fams.tick();
  res.json({ applied: applied.length, schedules: applied });
});

app.get('/v1/fams/health', (_req, res) => res.json({ ok: true, rules: fams.listRules().length, emergencies: fams.listEmergencies().length, schedules: fams.listSchedules().length }));

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
