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
 *   GET/POST /v1/fams/vendors · /v1/fams/assets (vendor & asset activation)
 *   GET/POST /v1/fams/emergency      (kill switch)
 *   GET/POST /v1/fams/schedules · POST /v1/fams/tick (time-based activation)
 *   GET  /v1/fams/rules · /v1/fams/locations · /v1/fams/analytics · /v1/fams/health
 *   → Feature Activation Middleware guards /v1/bookings* (403 + canonical message,
 *     full pipeline trace: location→country→state→city→flag→vendor→booking)
 *
 * SHIELD — Autonomous Cybersecurity & Threat Intelligence Swarm (docs/29):
 *   GET/POST /v1/shield/soc · /v1/shield/events · /v1/shield/threats
 *   POST /v1/shield/threats/:id/status · /v1/shield/correlate
 *   GET /v1/shield/agents · POST /v1/shield/agents/scale (hundreds→thousands)
 *   POST /v1/shield/fraud · GET /v1/shield/approvals · POST :id/decide
 *   GET /v1/shield/response · PUT /v1/shield/response/armed (kill-safe)
 *   GET /v1/shield/intel · POST /v1/shield/heal · POST /v1/shield/verify
 *   GET /v1/shield/compliance (SOC2·ISO27001·GDPR·NDPR·PCI DSS)
 *
 * ORGANISM — Global AI Organism Architecture (docs/30), 120,000+ agents:
 *   GET /v1/organism/state · /layers · /graph · /decisions · /tasks · /evolution
 *   POST /v1/organism/pulse  (one full intelligence cycle; SHIELD feeds it)
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import * as core from '../../libs/core/src/index';
import * as wa from '../../libs/whatsapp/src/index';
import { shield } from '../../libs/shield/src/index';
import { organism, TOTAL_AGENTS, LAYERS, fleetSummary, EXECUTIVE_CLUSTERS } from '../../libs/organism/src/index';
import { MobilitySystem, COMMAND_AUTH_MODEL } from '../../libs/mobility/src/index';
import {
  FamsEngine, type FamsRule, type FamsValue, type FamsLevel, type FamsContext, type FamsTargetKind,
  PLATFORM_MODULES, VERTICAL_MODULE, CATEGORY_VERTICAL, PHASES, ASSET_TYPES, VENDOR_STATE_VALUE,
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
 * Feature Activation Middleware — wraps the booking engine per the spec
 * workflow: User Request → Location Validation → Country → State → City →
 * Feature Flag → Vendor → Booking Engine. When the final decision is OFF the
 * caller gets the canonical message and a 403 — before pricing, dispatch or
 * escrow. The full stage trace is attached for ops.
 */
const famsOps = { evaluations: 0, blocked: 0 };
const famsMiddleware = (vertical = 'transportation') => (req: Request, res: Response, next: NextFunction) => {
  const ctx = famsCtxFrom(req.body ?? {});
  famsOps.evaluations++;
  const { decision, stages } = fams.evaluatePipeline('vertical', vertical, ctx);
  if (!decision.available) {
    famsOps.blocked++;
    return problem(res, 403, 'SERVICE_UNAVAILABLE', UNAVAILABLE_MESSAGE, { service: vertical, context: ctx, decision, pipeline: stages });
  }
  (req as any).fams = { decision, ctx, pipeline: stages };
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
  // SHIELD passive telemetry — the fraud swarm observes every booking
  // (observe-only here; autonomous actions flow through response policies)
  shield.ingestEvent({ category: 'api', source: 'mobile-app', principal: req.userId, action: 'booking.create', outcome: 'success', meta: { scheduled: Boolean(scheduledAt) } });
  shield.assessFraud({ kind: 'booking', principal: req.userId, amountMinor: undefined, meta: {} });
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

/** Vendor activation — spec lifecycle: active/suspended/pending_review/maintenance/disabled. */
app.get('/v1/fams/vendors', (_req, res) => {
  const rules = fams.listRules().filter((r) => r.level === 'vendor');
  const VALUE_STATE = { on: 'active', off: 'suspended', hidden: 'pending_review', maintenance: 'maintenance', beta: 'beta' } as const;
  res.json({
    vendors: rules.map((r) => ({
      vendorId: r.selector, vertical: r.target.code,
      state: r.value === 'off' && /disabled/i.test(r.note ?? '') ? 'disabled' : VALUE_STATE[r.value] ?? r.value,
      value: r.value, note: r.note, ruleId: r.id, updatedAt: r.updatedAt,
    })),
  });
});

app.post('/v1/fams/vendors', auth, (req: any, res) => {
  const { vendorId, state, reason } = req.body ?? {};
  if (!vendorId || !state) return problem(res, 422, 'VALIDATION_FAILED', 'vendorId and state required');
  const value = VENDOR_STATE_VALUE[state];
  if (!value) return problem(res, 422, 'VALIDATION_FAILED', `state must be one of ${['active','suspended','pending_review','maintenance','disabled'].join('|')}`);
  fams.upsertRule({ level: 'vendor', selector: String(vendorId), target: { kind: 'vertical', code: req.body?.vertical ?? 'transportation' }, value, note: reason ?? `vendor ${state}`, updatedBy: req.userId });
  res.status(201).json({ vendorId, state, value, effect: fams.evaluate('vertical', req.body?.vertical ?? 'transportation', { country: 'NG', vendorId: String(vendorId), userGroups: ['customers'] }) });
});

/** Asset activation — spec classes: car/motorcycle/dispatch_bike/helicopter/private_jet/charter_aircraft/boat/yacht. */
app.get('/v1/fams/assets', (_req, res) => {
  res.json({
    assetTypes: ASSET_TYPES,
    assets: fams.listRules().filter((r) => r.level === 'asset').map((r) => ({ assetId: r.selector, vertical: r.target.code, value: r.value, note: r.note, ruleId: r.id })),
  });
});

app.post('/v1/fams/assets', auth, (req: any, res) => {
  const { assetId, value, vertical, note } = req.body ?? {};
  if (!assetId || !value) return problem(res, 422, 'VALIDATION_FAILED', 'assetId and value required');
  if (!['on', 'off', 'hidden', 'maintenance', 'beta'].includes(value)) return problem(res, 422, 'VALIDATION_FAILED', 'value must be on|off|hidden|maintenance|beta');
  const rule = fams.upsertRule({ level: 'asset', selector: String(assetId), target: { kind: 'vertical', code: vertical ?? 'transportation' }, value, note, updatedBy: req.userId });
  res.status(201).json({ rule });
});

/** Country / State / City Management — location-scoped rules for the dashboard. */
app.get('/v1/fams/locations', (_req, res) => {
  const rules = fams.listRules();
  res.json({
    countries: rules.filter((r) => r.level === 'country').map((r) => ({ country: r.selector, service: r.target.code, value: r.value, note: r.note, ruleId: r.id })),
    states: rules.filter((r) => r.level === 'state').map((r) => ({ state: r.selector, service: r.target.code, value: r.value, note: r.note, ruleId: r.id })),
    cities: rules.filter((r) => r.level === 'city').map((r) => ({ city: r.selector, service: r.target.code, value: r.value, note: r.note, ruleId: r.id })),
    cityCatalog: Object.keys(CITY_STATE).map((c) => ({ code: c, state: CITY_STATE[c], stateName: STATE_NAMES[CITY_STATE[c]] })),
  });
});

/** Activation Analytics — the 10th dashboard module. */
app.get('/v1/fams/analytics', (_req, res) => {
  const rules = fams.listRules();
  const byLevel = rules.reduce<Record<string, number>>((acc, r) => { acc[r.level] = (acc[r.level] ?? 0) + 1; return acc; }, {});
  const byValue = rules.reduce<Record<string, number>>((acc, r) => { acc[r.value] = (acc[r.value] ?? 0) + 1; return acc; }, {});
  const cities = Object.keys(CITY_STATE);
  const verticals = ['transportation', 'logistics', 'travel', 'aviation', 'security', 'accommodation', 'roadside', 'corporate_services'];
  const coverage = cities.map((city) => ({
    city,
    state: CITY_STATE[city],
    live: verticals.filter((v) => fams.verticalAvailable(v, { country: 'NG', state: CITY_STATE[city], city, userGroups: ['customers'] })).length,
    of: verticals.length,
  }));
  res.json({
    totals: { rules: rules.length, emergencies: fams.listEmergencies().length, schedules: fams.listSchedules().length, modules: PLATFORM_MODULES.length },
    middleware: famsOps,
    rulesByLevel: byLevel,
    rulesByValue: byValue,
    cityCoverage: coverage,
    phase: PHASES,
  });
});

app.get('/v1/fams/health', (_req, res) => res.json({ ok: true, rules: fams.listRules().length, emergencies: fams.listEmergencies().length, schedules: fams.listSchedules().length }));

// ─── SHIELD — Autonomous Cybersecurity & Threat Intelligence Swarm (docs/29) ─
// SOC snapshot, event ingestion, fraud assessment, response approvals, intel,
// self-healing, zero-trust verification and compliance posture.
const shieldBaseline = shield.scale({ demandIndex: 1, infrastructureSize: 14, transactionsPerMin: 1200, threatLevel: 'low', countries: 1, vendors: 500, activeCustomers: 60_000 }); // baseline fleet; /v1/shield/agents/scale re-plans live
app.get('/v1/shield/soc', (_req, res) => res.json(shield.soc()));

app.post('/v1/shield/events', (req, res) => {
  const b = req.body ?? {};
  if (!b.action || !b.category) return problem(res, 422, 'VALIDATION_FAILED', 'category and action required');
  const { threats, actions } = shield.ingestEvent({
    category: b.category, source: b.source ?? 'api', principal: b.principal, ip: b.ip,
    deviceId: b.deviceId, action: b.action, outcome: b.outcome, bytesOut: b.bytesOut,
    riskHints: b.riskHints, meta: b.meta, ts: b.ts ? new Date(b.ts) : undefined,
  });
  res.status(201).json({ threats, actions, securityScore: shield.securityScore() });
});

app.get('/v1/shield/threats', (req, res) => {
  res.json({ threats: shield.detection.list({ status: req.query.status as any, type: req.query.type as any }) });
});

app.post('/v1/shield/threats/:id/status', (req, res) => {
  const { status } = req.body ?? {};
  if (!['open', 'containing', 'contained', 'resolved', 'false_positive'].includes(status)) {
    return problem(res, 422, 'VALIDATION_FAILED', 'status must be open|containing|contained|resolved|false_positive');
  }
  const t = shield.detection.setStatus(req.params.id, status);
  if (!t) return problem(res, 404, 'NOT_FOUND', 'Threat not found');
  if (status === 'resolved' || status === 'false_positive') shield.intel.archiveIncident(t);
  res.json({ threat: t });
});

app.post('/v1/shield/correlate', (_req, res) => res.json(shield.correlate()));

app.get('/v1/shield/agents', (_req, res) => res.json(shield.agents.status()));

app.post('/v1/shield/agents/scale', (req, res) => {
  const b = req.body ?? {};
  const { planned, total } = shield.scale({
    demandIndex: b.demandIndex, infrastructureSize: b.infrastructureSize,
    transactionsPerMin: b.transactionsPerMin, threatLevel: b.threatLevel,
    countries: b.countries, vendors: b.vendors, activeCustomers: b.activeCustomers,
  });
  res.json({ planned, totalAgents: total });
});

app.post('/v1/shield/fraud', (req, res) => {
  const b = req.body ?? {};
  if (!b.kind || !b.principal) return problem(res, 422, 'VALIDATION_FAILED', 'kind and principal required');
  const out = shield.assessFraud({ kind: b.kind, principal: b.principal, amountMinor: b.amountMinor, city: b.city, deviceId: b.deviceId, meta: b.meta });
  res.status(out.alert ? 201 : 200).json({ ...out, trustScore: shield.fraud.trustScore(b.principal) });
});

app.get('/v1/shield/approvals', (_req, res) => res.json({ pending: shield.response.pendingApprovals() }));

app.post('/v1/shield/approvals/:id/decide', (req, res) => {
  const { decision, admin } = req.body ?? {};
  if (!['approved', 'rejected'].includes(decision)) return problem(res, 422, 'VALIDATION_FAILED', 'decision must be approved|rejected');
  const rec = shield.response.decide(req.params.id, decision, admin ?? 'admin_api');
  if (!rec) return problem(res, 404, 'NOT_FOUND', 'Approval not found or already decided');
  res.json({ record: rec });
});

app.get('/v1/shield/response', (_req, res) => res.json({ policies: shield.response.listPolicies(), ledger: shield.response.listRecords().slice(-50) }));

app.put('/v1/shield/response/armed', (req, res) => {
  const { armed } = req.body ?? {};
  if (typeof armed !== 'boolean') return problem(res, 422, 'VALIDATION_FAILED', 'armed (boolean) required');
  shield.response.armed = armed;
  res.json({ armed: shield.response.armed, note: armed ? 'autonomous response ARMED — policies execute per mode' : 'DISARMED — observe & alert only' });
});

app.get('/v1/shield/intel', (_req, res) => res.json({ ...shield.intel.export(), prioritized: shield.intel.prioritize(), prediction: shield.intel.predict() }));

app.post('/v1/shield/heal', (req, res) => {
  const services = req.body?.services;
  if (!Array.isArray(services) || services.length === 0) return problem(res, 422, 'VALIDATION_FAILED', 'services[] required ({service, status, latencyMs?, errorRate?})');
  const out = shield.heal(services);
  res.json({ ...out, runs: shield.healing.list().slice(-10) });
});

app.post('/v1/shield/verify', (req, res) => {
  const b = req.body ?? {};
  if (!b.capability || !b.role) return problem(res, 422, 'VALIDATION_FAILED', 'role and capability required');
  res.json(shield.verify({ principal: b.principal ?? 'anon', role: b.role, capability: b.capability, deviceId: b.deviceId, deviceTrust: b.deviceTrust, ip: b.ip, sessionAgeMin: b.sessionAgeMin, mfaDone: b.mfaDone, riskScore: b.riskScore }));
});

app.get('/v1/shield/compliance', (_req, res) => res.json(shield.compliance()));

// ─── ORGANISM — Global AI Organism Architecture (docs/30) ────────────────────
// 8 layers · 120,000+ agents · shared intelligence graph · AI executive board ·
// autonomous execution · continuous evolution. One pulse = the full 7-step
// intelligence flow; SHIELD feeds the security layer's posture into every cycle.
app.get('/v1/organism/state', (_req, res) => res.json(organism.state()));

app.get('/v1/organism/layers', (_req, res) =>
  res.json({ total: TOTAL_AGENTS, layers: fleetSummary(), detail: LAYERS, executive: EXECUTIVE_CLUSTERS }));

app.post('/v1/organism/pulse', (req, res) => {
  const b = req.body ?? {};
  // threat posture flows in from the security layer (SHIELD) unless overridden
  const threatLevel = b.threatLevel ?? shield.soc().riskLevel as any;
  const report = organism.pulse({
    demandIndex: b.demandIndex, latencyMs: b.latencyMs, errorRate: b.errorRate,
    threatLevel, revenueRunRateMinor: b.revenueRunRateMinor, costRunRateMinor: b.costRunRateMinor,
    churnPct: b.churnPct, nps: b.nps, activeCustomers: b.activeCustomers,
    vendorCount: b.vendorCount, fraudLossMinor: b.fraudLossMinor, aiCostPct: b.aiCostPct,
  });
  res.status(201).json(report);
});

app.get('/v1/organism/decisions', (_req, res) => {
  const last = organism.history().at(-1);
  res.json({ pulse: last?.pulseId ?? null, decisions: last?.decisions ?? [] });
});

app.get('/v1/organism/tasks', (_req, res) => {
  const last = organism.history().at(-1);
  res.json({ pulse: last?.pulseId ?? null, tasks: last?.tasks ?? [], results: last?.results ?? [] });
});

app.get('/v1/organism/evolution', (_req, res) =>
  res.json({ adopted: organism.evolution.adopted, tunables: organism.tunables, history: organism.evolution.history() }));

app.get('/v1/organism/graph', (_req, res) => res.json(organism.graph.stats()));

// ─── AUTONOMOUS AI MOBILITY (docs/31) — integrated, not standalone ───────────
// Vehicle tracking & intelligence, driver assistance, autonomy (FAMS-gated),
// vehicle-aware routing, fleet intelligence, autonomous pipelines, safety and
// vehicle cybersecurity — bridged into FAMS (docs/28), SHIELD (docs/29) and
// the ORGANISM intelligence graph (docs/30).
const mobility = new MobilitySystem(
  { allows: (feature, ctx) => fams.evaluate('feature', feature, ctx as any).available },
  {
    reportVehicleSecurity: (e) => shield.ingestEvent({
      category: 'vehicle', source: 'vehicle-telemetry', principal: e.principal ?? e.vehicleId,
      action: `vehicle.${e.signal}`, outcome: 'denied', riskHints: e.riskHints ?? [e.signal],
      meta: { evidence: e.evidence, vehicleId: e.vehicleId },
    }),
  },
  { observe: (o) => organism.graph.observe({ ...o, ts: new Date() } as any) },
);

app.get('/v1/mobility/vehicles', (_req, res) => res.json({ vehicles: mobility.listVehicles() }));

app.post('/v1/mobility/vehicles', (req, res) => {
  const b = req.body ?? {};
  if (!b.id || !b.cls) return problem(res, 422, 'VALIDATION_FAILED', 'id and cls required (car|taxi|suv|chauffeur|delivery_bike|motorcycle|truck|bus|autonomous_vehicle|aircraft|marine)');
  const v = mobility.registerVehicle({
    id: String(b.id), code: b.code ?? String(b.id), cls: b.cls, fleetId: b.fleetId, vendorId: b.vendorId,
    autonomyLevel: Number(b.autonomyLevel ?? 0), modesSupported: b.modesSupported ?? ['manual'],
    status: b.status ?? 'active', telematics: Boolean(b.telematics ?? true), healthScore: b.healthScore,
  } as any);
  res.status(201).json({ vehicle: v });
});

app.post('/v1/mobility/telemetry', (req, res) => {
  const b = req.body ?? {};
  if (!b.vehicleId || typeof b.lat !== 'number' || typeof b.lng !== 'number') return problem(res, 422, 'VALIDATION_FAILED', 'vehicleId, lat, lng required');
  const out = mobility.ingestTelemetry({
    vehicleId: String(b.vehicleId), ts: b.ts ? new Date(b.ts) : new Date(),
    lat: b.lat, lng: b.lng, speedKph: b.speedKph ?? 0, headingDeg: b.headingDeg ?? 0,
    routeId: b.routeId, destination: b.destination, driverStatus: b.driverStatus, vehicleStatus: b.vehicleStatus,
    engineOn: b.engineOn, fuelOrBatteryPct: b.fuelOrBatteryPct, healthScore: b.healthScore, roadZone: b.roadZone, meta: b.meta,
  });
  if (out.gated) return problem(res, 403, 'SERVICE_UNAVAILABLE', UNAVAILABLE_MESSAGE, { feature: 'mob.tracking' });
  res.status(201).json(out);
});

app.get('/v1/mobility/control-center', (_req, res) => res.json(mobility.controlCenter()));

app.post('/v1/mobility/driver-assist', (req, res) => {
  const b = req.body ?? {};
  res.json({ messages: mobility.advise(b) });
});

app.post('/v1/mobility/autonomy/mode', (req, res) => {
  const b = req.body ?? {};
  const vehicle = mobility.tracker.get(String(b.vehicleId));
  if (!vehicle) return problem(res, 404, 'NOT_FOUND', 'Vehicle not registered');
  const mode = b.mode;
  if (!['manual', 'ai_assisted', 'supervised_autonomous', 'full_autonomous'].includes(mode)) {
    return problem(res, 422, 'VALIDATION_FAILED', 'mode must be manual|ai_assisted|supervised_autonomous|full_autonomous');
  }
  const sensors = (Array.isArray(b.sensors) ? b.sensors : []).map((r: any) => ({
    source: r.source, agreesWithPosition: r.agreesWithPosition,
    objects: r.objects ?? (r.objectType !== undefined && r.confidence !== undefined ? { [r.objectType]: r.confidence } : {}),
  }));
  const env = mobility.understand(sensors);
  const out = mobility.requestMode(vehicle, mode, env, {
    country: b.country ?? 'NG', state: b.state, city: b.city, roadZone: b.roadZone,
    fleetId: vehicle.fleetId, vehicleId: vehicle.id, vendorId: vehicle.vendorId, userGroups: ['vendors'],
  }, Boolean(b.legalApproval));
  res.json({ requested: mode, ...out, environment: env });
});

app.post('/v1/mobility/route', (req, res) => {
  const b = req.body ?? {};
  const vehicle = mobility.tracker.get(String(b.vehicleId));
  if (!vehicle) return problem(res, 404, 'NOT_FOUND', 'Vehicle not registered');
  if (!Array.isArray(b.candidates)) return problem(res, 422, 'VALIDATION_FAILED', 'candidates[] required');
  res.json({ options: mobility.route({
    distanceKm: b.distanceKm ?? 10, traffic: b.traffic ?? 'moderate', roadQuality: b.roadQuality ?? 'good',
    weather: b.weather ?? 'clear', closures: b.closures, securityRisk: b.securityRisk,
    vehicle, load: b.load, requirement: b.requirement,
  }, b.candidates) });
});

app.post('/v1/mobility/fleet/:fleetId/intelligence', (req, res) => {
  const stats = (req.body?.stats ?? []).map((s: any) => ({ ...s, vehicle: mobility.tracker.get(s.vehicleId) }).vehicle ? { ...s, vehicle: mobility.tracker.get(s.vehicleId)! } : null).filter(Boolean);
  res.json(mobility.fleetAnalysis(stats));
});

app.post('/v1/mobility/delivery/autonomous', (req, res) => {
  const b = req.body ?? {};
  const allowed = fams.evaluate('feature', 'mob.autonomous_delivery', { country: b.country ?? 'NG', city: b.city, roadZone: b.roadZone, userGroups: ['customers'] }).available;
  res.json(mobility.deliveryPlan({
    allowed, vehicleAssigned: b.vehicleAssigned ?? true, routeFound: b.routeFound ?? true,
    autonomous: b.autonomous ?? true, tracked: true, confirmed: b.confirmed ?? true,
  }));
});

app.post('/v1/mobility/ride/autonomous', (req, res) => {
  const b = req.body ?? {};
  const allowed = fams.evaluate('feature', 'mob.self_driving', { country: b.country ?? 'NG', city: b.city, roadZone: b.roadZone, userGroups: ['customers'] }).available;
  res.json(mobility.ridePlan({
    matched: b.matched ?? true, avAssigned: b.avAssigned ?? true, allowed,
    pickup: b.pickup ?? true, trip: b.trip ?? true, arrived: b.arrived ?? true, paid: b.paid ?? true,
  }));
});

app.post('/v1/mobility/safety', (req, res) => {
  const b = req.body ?? {};
  if (!['collision_risk', 'dangerous_road', 'vehicle_failure', 'driver_emergency', 'passenger_emergency', 'unusual_movement'].includes(b.type)) {
    return problem(res, 422, 'VALIDATION_FAILED', 'type required (collision_risk|dangerous_road|vehicle_failure|driver_emergency|passenger_emergency|unusual_movement)');
  }
  const response = mobility.safetyResponse(b.type, { severity: b.severity ?? 0.5, immobilizeSupported: Boolean(b.immobilizeSupported), legallyPermitted: Boolean(b.legallyPermitted) });
  if (response.workflow === 'emergency_workflow' || response.escalateToHumans) {
    shield.ingestEvent({ category: 'vehicle', source: 'safety-system', principal: b.vehicleId, action: `safety.${b.type}`, outcome: 'denied', riskHints: ['emergency'] });
  }
  res.status(201).json({ type: b.type, response });
});

app.post('/v1/mobility/vehicle-command', (req, res) => {
  const b = req.body ?? {};
  const signal = mobility.checkVehicleCommand({ command: b.command, principal: b.principal, authorizedPrincipals: b.authorizedPrincipals, sensorContradiction: b.sensorContradiction, vinMatch: b.vinMatch, remoteAccess: b.remoteAccess });
  if (signal) return problem(res, 403, 'VEHICLE_SECURITY_BLOCK', `Command rejected — ${signal}`, { signal, authModel: COMMAND_AUTH_MODEL });
  res.json({ accepted: true, authModel: COMMAND_AUTH_MODEL });
});

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
