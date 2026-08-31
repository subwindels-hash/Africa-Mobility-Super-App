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
import { InterstateSystem, InterstateWhatsAppBridge, haversineKm } from '../../libs/interstate/src/index';
import { SessionStore, RefreshManager, AuditLog, generateTotpSecret, verifyTotp } from '../../libs/auth/src/index';
import { WalletService } from '../../libs/wallet/src/index';
import { PaymentService } from '../../libs/payments/src/index';
import { TravelService } from '../../libs/travel/src/index';
import { VendorService } from '../../libs/vendors/src/index';
import { LoyaltyService } from '../../libs/loyalty/src/index';
import { DisputeService } from '../../libs/disputes/src/index';
import { KycService, PrivacyService, PciTracker, screen } from '../../libs/compliance/src/index';
import { NotificationService } from '../../libs/notifications/src/index';
import { MediaService } from '../../libs/media/src/index';
import { GeoService } from '../../libs/geo/src/index';
import { SignalingServer, MessageStore, SmsGateway } from '../../libs/chat/src/index';
import {
  VerticalEngine, AIRCRAFT_TYPES, ROOM_TYPES, EXPERIENCES, SECURITY_SERVICES,
  ROADSIDE_RATES, INTERCITY_ROUTES, MARINE_VESSELS, CORPORATE_SERVICES,
} from '../../libs/verticals/src/index';
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

// ─── INTERSTATE LOGISTICS & LONG-DISTANCE FREIGHT (docs/32) ──────────────────
// Nationwide freight marketplace — platform owns no trucks; verified partners
// only. Escrow = core domain (fund → hold → milestones → settlement split).
const ilstEscrow = new Map<string, core.EscrowHold>();
const interstate = new InterstateSystem(
  {
    feature: (f, ctx) => fams.evaluate('feature', f, ctx as any).available,
    category: (c, ctx) => fams.evaluate('category', c, ctx as any).available,
    vendor: (v, ctx) => fams.evaluate('vertical', 'logistics', { ...(ctx as any), vendorId: v }).available,
  },
  {
    openEscrow: (bookingId, customer, vendor, totalMinor, milestones) => {
      const hold = core.openEscrow({ bookingId, customer, vendor, total: core.money(totalMinor, 'NGN'), milestones });
      ilstEscrow.set(hold.id, hold);
      return { escrowId: hold.id, state: hold.state };
    },
    fund: (id) => { const h = core.fund(ilstEscrow.get(id)!); return h.state; },
    begin: (id) => { const h = core.beginService(ilstEscrow.get(id)!); return h.state; },
    releaseMilestone: (id, index) => { const h = core.releaseMilestone(ilstEscrow.get(id)!, index, core.DEFAULT_RULE); return h.state; },
    releaseOnCompletion: (id) => {
      const { hold, split } = core.releaseOnCompletion(ilstEscrow.get(id)!, 'completed', core.DEFAULT_RULE);
      return { vendorPayoutMinor: split.vendorNet.amount };
    },
    refund: (id) => {
      const hold = ilstEscrow.get(id)!;
      core.openDispute(hold);
      core.resolveDispute(hold, { type: 'refund_customer' }, core.DEFAULT_RULE);
      return hold.state;
    },
    hold: (id) => ilstEscrow.get(id),
  },
  { observe: (o) => organism.graph.observe({ ...o, ts: new Date() } as any) },
);
// seed three verified logistics partners (demo marketplace)
for (const [id, name, rating, onTime, fleets] of [
  ['vnd_bolt_haul', 'Bolt Haul Nigeria', 4.8, 96, { heavy_truck: 12, articulated_trailer: 6, box_truck: 10, flatbed_truck: 4, medium_truck: 8, container_truck: 3, low_loader: 2, mini_van: 6, cargo_van: 8, pickup_truck: 5, light_truck: 4, refrigerated_truck: 2, tanker: 1, specialized_heavy_haul: 1 }],
  ['vnd_dangote_log', 'Dangote Logistics', 4.6, 93, { heavy_truck: 20, articulated_trailer: 10, box_truck: 14, flatbed_truck: 8, medium_truck: 12, container_truck: 5, low_loader: 3, refrigerated_truck: 3, tanker: 4 }],
  ['vnd_cold_express', 'ColdExpress Freight', 4.9, 98, { refrigerated_truck: 8, medium_truck: 4, box_truck: 6 }],
] as const) {
  interstate.registerVendor(id, id === 'vnd_cold_express' ? 'cold_chain_operator' : 'trucking_company');
  for (const step of interstate.verificationSteps) interstate.decideVerification(id, step, 'approved', 'admin_seed');
  interstate.marketplace.registerProvider({
    vendorId: id, name, verified: true, rating, onTimePct: onTime, fleets,
    regions: ['NG-LAG', 'NG-KAN', 'NG-FCT', 'NG-RIV', 'NG-OYO', 'NG-KAD'],
  });
}
// Ada (WhatsApp Smart AI) ↔ interstate freight desk
const adaInterstate = new InterstateWhatsAppBridge(interstate);
wa.setInterstateBridge({ handle: (phone, session, nlu, rawText) => adaInterstate.handle(phone, session, nlu, rawText) as any });

const ilstCtx = (b: any) => ({ country: 'NG', state: b.originState, userGroups: [b.corporate ? 'corporate' : 'customers'] });

app.get('/v1/interstate/catalog', (_req, res) => res.json(interstate.catalog()));

app.get('/v1/interstate/vendors', (_req, res) => res.json({
  vendorTypes: interstate.vendorTypes,
  verificationSteps: interstate.verificationSteps,
  active: interstate.activeVendors({ country: 'NG' }).map((v) => ({ vendorId: v.vendorId, type: v.type })),
}));

app.post('/v1/interstate/vendors', (req, res) => {
  const b = req.body ?? {};
  if (!b.vendorId || !b.type) return problem(res, 422, 'VALIDATION_FAILED', 'vendorId and type required (trucking_company|fleet_operator|independent_truck_owner|freight_broker|warehouse_operator|cold_chain_operator|distribution_company)');
  const v = interstate.registerVendor(String(b.vendorId), b.type);
  if (b.approveAll === true) for (const s of interstate.verificationSteps) interstate.decideVerification(String(b.vendorId), s, 'approved', String(b.by ?? 'admin_1'));
  res.status(201).json({ vendor: { vendorId: v.vendorId, type: v.type, steps: v.steps, active: v.active() } });
});

app.post('/v1/interstate/vendors/:id/verification', (req, res) => {
  const b = req.body ?? {};
  if (!b.step || !['approved', 'rejected'].includes(b.status)) return problem(res, 422, 'VALIDATION_FAILED', 'step + status(approved|rejected) required');
  try {
    const v = interstate.decideVerification(req.params.id, b.step, b.status, String(b.by ?? 'admin_1'));
    res.json({ vendor: { vendorId: v.vendorId, steps: v.steps, active: v.active() } });
  } catch (e: any) { return problem(res, 404, 'NOT_FOUND', e.message); }
});

app.post('/v1/interstate/quote', (req, res) => {
  const b = req.body ?? {};
  if (!b.service || !b.cargo?.weightKg || !b.originState || !b.destinationState) {
    return problem(res, 422, 'VALIDATION_FAILED', 'service, cargo.weightKg, originState, destinationState required');
  }
  try {
    const q = interstate.quote({
      service: b.service, cargo: b.cargo, distanceKm: Number(b.distanceKm ?? haversineKm(6.5244, 3.3792, 9.0765, 7.3986)),
      originState: b.originState, destinationState: b.destinationState,
      option: b.option, urgency: b.urgency, routeSecurityRisk: b.routeSecurityRisk,
    }, ilstCtx(b));
    res.json(q);
  } catch (e: any) {
    // FAMS gate rejections surface as 403 FEATURE_DISABLED; anything else is OUR bug — 500, honestly.
    const gate = typeof e?.message === 'string' && /disabled|not (yet )?available|gated/i.test(e.message);
    return problem(res, gate ? 403 : 500, gate ? 'FEATURE_DISABLED' : 'INTERNAL_ERROR', e.message);
  }
});

app.post('/v1/interstate/recommend', (req, res) => {
  const b = req.body ?? {};
  if (!b.candidates?.length || !b.conditions) return problem(res, 422, 'VALIDATION_FAILED', 'candidates[] and conditions required');
  try {
    res.json(interstate.recommend({ service: b.service, cargo: b.cargo, distanceKm: b.distanceKm, originState: b.originState, destinationState: b.destinationState, urgency: b.urgency, candidates: b.candidates, conditions: b.conditions }, ilstCtx(b)));
  } catch (e: any) { return problem(res, 403, 'FEATURE_DISABLED', e.message); }
});

app.post('/v1/interstate/book', (req, res) => {
  const b = req.body ?? {};
  if (!b.service || !b.vendorId || !b.cargo?.weightKg || !b.stops?.length) {
    return problem(res, 422, 'VALIDATION_FAILED', 'service, vendorId, cargo.weightKg, stops[] required');
  }
  try {
    const distanceKm = Number(b.distanceKm ?? 500);
    const quote = b.quote ?? interstate.quote({ service: b.service, cargo: b.cargo, distanceKm, originState: b.originState ?? 'NG-LAG', destinationState: b.destinationState ?? 'NG-FCT', option: b.option }, ilstCtx(b));
    const s = interstate.book({
      quote, vendorId: b.vendorId, cargo: b.cargo, service: b.service, stops: b.stops,
      customerId: b.customerId ?? 'cus_anon', corporateAccountId: b.corporateAccountId,
      option: b.option ?? 'instant', scheduledFor: b.scheduledFor ? new Date(b.scheduledFor) : undefined,
      recurrence: b.recurrence, plate: b.plate, paymentMode: b.paymentMode ?? 'escrow',
      insured: b.insured, insurancePolicy: b.insurancePolicy,
    }, ilstCtx(b));
    res.status(201).json({ shipment: s });
  } catch (e: any) { return problem(res, 403, 'BOOKING_REFUSED', e.message); }
});

app.get('/v1/interstate/shipments', (req, res) => res.json({
  shipments: interstate.list({ customerId: req.query.customerId as string, vendorId: req.query.vendorId as string, status: req.query.status as any }),
}));

app.get('/v1/interstate/shipments/:id', (req, res) => {
  const s = interstate.shipment(req.params.id);
  if (!s) return problem(res, 404, 'NOT_FOUND', 'Shipment not found');
  res.json({ shipment: s });
});

app.post('/v1/interstate/shipments/:id/status', (req, res) => {
  const b = req.body ?? {};
  try {
    if (b.to === 'cargo_loaded') res.json({ shipment: interstate.markLoaded(req.params.id) });
    else if (b.to === 'cancelled') res.json({ shipment: interstate.cancel(req.params.id) });
    else if (b.to === 'completed') res.json(interstate.complete(req.params.id));
    else res.json({ shipment: interstate.marketplace.advance(req.params.id, b.to) });
  } catch (e: any) { return problem(res, 422, 'ILLEGAL_TRANSITION', e.message); }
});

app.post('/v1/interstate/shipments/:id/checkpoint', (req, res) => {
  const b = req.body ?? {};
  try {
    res.status(201).json(interstate.checkpoint(req.params.id, { lat: b.lat, lng: b.lng, label: b.label ?? 'Checkpoint', note: b.note, outsideGeofence: b.outsideGeofence, sealBroken: b.sealBroken }));
  } catch (e: any) { return problem(res, 422, 'CHECKPOINT_FAILED', e.message); }
});

app.post('/v1/interstate/shipments/:id/proof', (req, res) => {
  const b = req.body ?? {};
  if (!['pickup', 'delivery'].includes(b.type) || !b.photos?.length || !b.signedBy) {
    return problem(res, 422, 'VALIDATION_FAILED', 'type(pickup|delivery), photos[], signedBy required');
  }
  try {
    res.status(201).json({ proof: interstate.proof(req.params.id, b.type, b.photos, b.signedBy, b.signature ?? `sig:sha256:${Date.now()}`) });
  } catch (e: any) { return problem(res, 422, 'PROOF_FAILED', e.message); }
});

app.post('/v1/interstate/shipments/:id/tracking-link', (req, res) => {
  const b = req.body ?? {};
  if (!b.recipient) return problem(res, 422, 'VALIDATION_FAILED', 'recipient required');
  res.json({ link: interstate.trackingLink(req.params.id, String(b.recipient), Number(b.ttlHours ?? 72)) });
});

app.post('/v1/interstate/shipments/:id/rate', (req, res) => {
  const b = req.body ?? {};
  res.json({ shipment: interstate.marketplace.rate(req.params.id, Number(b.score ?? 5), b.comment) });
});

app.post('/v1/interstate/corporate/accounts', (req, res) => {
  const b = req.body ?? {};
  if (!b.accountId || !b.departments?.length) return problem(res, 422, 'VALIDATION_FAILED', 'accountId and departments[] required');
  res.status(201).json({ account: interstate.corporate.createAccount(String(b.accountId), b.name ?? b.accountId, b.departments) });
});

app.post('/v1/interstate/corporate/requests', (req, res) => {
  const b = req.body ?? {};
  try {
    res.status(201).json({ request: interstate.corporate.raiseRequest({ accountId: b.accountId, departmentCode: b.departmentCode, requestedBy: b.requestedBy, service: b.service, originState: b.originState, destState: b.destState, estimatedMinor: b.estimatedMinor, note: b.note }) });
  } catch (e: any) { return problem(res, 422, 'CORPORATE_REFUSED', e.message); }
});

app.post('/v1/interstate/corporate/requests/:id/decide', (req, res) => {
  const b = req.body ?? {};
  if (!['approved', 'rejected'].includes(b.decision)) return problem(res, 422, 'VALIDATION_FAILED', 'decision(approved|rejected) required');
  try {
    res.json({ request: interstate.corporate.decide(req.params.id, String(b.approver), b.decision) });
  } catch (e: any) { return problem(res, 422, 'APPROVAL_REFUSED', e.message); }
});

app.get('/v1/interstate/analytics', (_req, res) => res.json(interstate.analytics(
  [
    { category: 'heavy_truck', utilizationPct: 82 }, { category: 'articulated_trailer', utilizationPct: 64 },
    { category: 'refrigerated_truck', utilizationPct: 71 }, { category: 'box_truck', utilizationPct: 77 },
  ],
  { avgHealthPct: 88, maintenanceDue: 3 },
)));

// ─── PLATFORM SERVICES (auth · wallet · payments · travel · vendors · loyalty
//     · disputes · compliance · notifications · media · geo · chat · verticals)
const platformAuth = { sessions: new SessionStore(), refresh: new RefreshManager(), audit: new AuditLog() };
const walletsSvc = new WalletService();
const paymentsSvc = new PaymentService(
  { paystack: process.env.PAYSTACK_SECRET ?? 'pk_test_demo', flutterwave: process.env.FLW_SECRET ?? 'fw_test_demo', monnify: process.env.MONNIFY_SECRET ?? 'mn_test_demo' },
  { onSettled: (ref, amt) => { const w = walletsSvc.byUser(ref.split(':')[0]); if (w) walletsSvc.topup(w, amt, `psp:${ref}`); }, onRefunded: () => undefined },
);
const travelSvc = new TravelService();
const vendorsSvc = new VendorService();
const loyaltySvc = new LoyaltyService();
const disputesSvc = new DisputeService({
  refundCustomer: (ref, amt) => void { ref, amt },     // escrow bridge in prod
  releaseVendor: (ref, amt) => void { ref, amt },
});
const kycSvc = new KycService();
const privacySvc = new PrivacyService();
const pciTracker = new PciTracker();
const notificationsSvc = new NotificationService();
const mediaSvc = new MediaService();
const geoSvc = new GeoService();
const signaling = new SignalingServer();
const chatStore = new MessageStore();
const smsGateway = new SmsGateway();
const verticalEngines = new Map<string, VerticalEngine>();
function verticalEngine(code: string): VerticalEngine {
  if (!verticalEngines.has(code)) verticalEngines.set(code, new VerticalEngine(
    { module: (m, ctx) => fams.evaluate('module', m, (ctx ?? { country: 'NG' }) as any).available },
  ));
  return verticalEngines.get(code)!;
}
for (const [code, providers] of [
  ['aviation', [{ id: 'av_vipjets', name: 'VIP Jets NG', rating: 4.9 }, { id: 'av_ibom', name: 'Ibom Air Charter', rating: 4.2 }]],
  ['hotels', [{ id: 'htl_eko', name: 'Eko Suites', rating: 4.7 }, { id: 'htl_george', name: 'The George', rating: 4.8 }]],
  ['tourism', [{ id: 'tgp_1', name: 'AMSA Experiences', rating: 4.6 }]],
  ['security', [{ id: 'sec_vg', name: 'Vanguard Security', rating: 4.8 }]],
  ['roadside', [{ id: 'rsa_fix', name: 'FixIt Roadside', rating: 4.5 }]],
  ['intercity', [{ id: 'ic_gigm', name: 'GIGM', rating: 4.3 }]],
  ['marine', [{ id: 'mar_blue', name: 'Bluewater Marine', rating: 4.7 }]],
  ['corporate_services', [{ id: 'corp_am', name: 'AMSA Corporate', rating: 4.9 }]],
] as const) {
  const e = verticalEngine(code);
  for (const p of providers) e.register(code, p as any);
}

// auth
app.post('/v1/auth/mfa/enroll', (req, res) => {
  const secret = generateTotpSecret();
  platformAuth.sessions.login(String(req.body?.userId ?? 'usr_anon'), { deviceId: 'mfa', userAgent: 'enroll', ip: req.ip ?? '0.0.0.0' });
  res.status(201).json({ secret, otpauth: `otpauth://totp/AMSA:${req.body?.userId ?? 'usr'}?issuer=AMSA` });
});
app.post('/v1/auth/mfa/verify', (req, res) => {
  const { secret, code } = req.body ?? {};
  if (!secret || !code) return problem(res, 422, 'VALIDATION_FAILED', 'secret and code required');
  const ok = verifyTotp(secret, String(code));
  if (!ok) return problem(res, 401, 'MFA_FAILED', 'invalid TOTP code');
  res.json({ verified: true });
});
app.get('/v1/auth/sessions/:userId', (req, res) => res.json({ sessions: platformAuth.sessions.listSessions(req.params.userId) }));
app.post('/v1/auth/sessions/:id/revoke', (req, res) => { platformAuth.sessions.revoke(req.params.id); res.json({ revoked: true }); });
app.post('/v1/auth/refresh', (req, res) => {
  try { res.json(platformAuth.refresh.rotate(String(req.body?.userId), String(req.body?.refresh), { secret: 'amsa-demo' })); }
  catch (e: any) { return problem(res, 401, 'REFRESH_REJECTED', e.message); }
});

// wallet
app.post('/v1/wallets', (req, res) => res.status(201).json({ wallet: walletsSvc.open(String(req.body?.userId ?? 'usr_anon')) }));
app.get('/v1/wallets/:id', (_req, res) => res.json({ statement: 'use /v1/wallets/me (demo)' }));
app.post('/v1/wallets/:id/topup', (req, res) => {
  const w = walletsSvc.get(req.params.id);
  if (!w) return problem(res, 404, 'NOT_FOUND', 'wallet not found');
  try { walletsSvc.topup(w, Number(req.body?.amountMinor ?? 0), String(req.body?.reference ?? `top_${Date.now()}`)); }
  catch (e: any) { return problem(res, 422, 'WALLET_REFUSED', e.message); }
  res.status(201).json({ statement: walletsSvc.statement(w) });
});
app.post('/v1/wallets/:id/transfer', (req, res) => {
  const from = walletsSvc.get(req.params.id);
  const to = walletsSvc.byUser(String(req.body?.toUserId ?? ''));
  if (!from || !to) return problem(res, 404, 'NOT_FOUND', 'wallet(s) not found');
  try { walletsSvc.transfer(from, to, Number(req.body?.amountMinor), String(req.body?.reference ?? `tr_${Date.now()}`)); }
  catch (e: any) { return problem(res, 422, 'WALLET_REFUSED', e.message); }
  res.json({ from: walletsSvc.statement(from), to: walletsSvc.statement(to) });
});
app.post('/v1/wallets/:id/withdraw', (req, res) => {
  const w = walletsSvc.get(req.params.id);
  if (!w) return problem(res, 404, 'NOT_FOUND', 'wallet not found');
  try { walletsSvc.withdraw(w, Number(req.body?.amountMinor), String(req.body?.reference ?? `wd_${Date.now()}`)); }
  catch (e: any) { return problem(res, 422, 'WALLET_REFUSED', e.message); }
  res.json({ statement: walletsSvc.statement(w) });
});

// payments
app.post('/v1/payments/initialize', (req, res) => {
  const b = req.body ?? {};
  if (!b.reference || !b.amountMinor || !b.email) return problem(res, 422, 'VALIDATION_FAILED', 'reference, amountMinor, email required');
  try { res.status(201).json(paymentsSvc.initialize({ reference: String(b.reference), amountMinor: Number(b.amountMinor), currency: 'NGN', email: String(b.email), channel: b.channel })); }
  catch (e: any) { return problem(res, 409, 'DUPLICATE_REFERENCE', e.message); }
});
app.post('/v1/payments/webhook/:psp', (req, res) => {
  const raw = JSON.stringify(req.body ?? {});
  const out = paymentsSvc.webhook(req.params.psp as any, raw, String(req.headers['x-paystack-signature'] ?? req.headers['verif-hash'] ?? req.headers['monnify-signature'] ?? 'none'), { reference: req.body?.reference, status: req.body?.status });
  if (!out.accepted) return problem(res, 400, 'WEBHOOK_REJECTED', out.reason);
  res.json(out);
});
app.post('/v1/payments/:reference/confirm', (req, res) => {
  try { res.json({ payment: paymentsSvc.confirm(req.params.reference) }); }
  catch (e: any) { return problem(res, 404, 'NOT_FOUND', e.message); }
});
app.post('/v1/payments/:reference/refund', (req, res) => {
  try { res.json({ payment: paymentsSvc.refund(req.params.reference, req.body?.amountMinor) }); }
  catch (e: any) { return problem(res, 422, 'REFUND_REFUSED', e.message); }
});

// travel
app.post('/v1/travel/search', (req, res) => {
  const b = req.body ?? {};
  if (!b.origin || !b.destination || !b.departDate || !b.passengers) return problem(res, 422, 'VALIDATION_FAILED', 'origin, destination, departDate, passengers required');
  res.json({ offers: travelSvc.search({ origin: b.origin, destination: b.destination, departDate: b.departDate, passengers: Number(b.passengers), cabin: b.cabin }) });
});
app.post('/v1/travel/book', (req, res) => {
  const b = req.body ?? {};
  try { res.status(201).json(travelSvc.book({ origin: b.origin, destination: b.destination, departDate: b.departDate, passengers: Number(b.passengers), cabin: b.cabin }, String(b.offerId), { payNow: b.payNow !== false })); }
  catch (e: any) { return problem(res, 422, 'TRAVEL_REFUSED', e.message); }
});
app.post('/v1/travel/:pnr/cancel', (req, res) => {
  try { res.json(travelSvc.cancel(req.params.pnr)); }
  catch (e: any) { return problem(res, 422, 'CANCEL_REFUSED', e.message); }
});

// vendors (16 types / 11-step chain / subscriptions)
app.post('/v1/vendors', (req, res) => {
  const b = req.body ?? {};
  try { res.status(201).json({ vendor: vendorsSvc.register(String(b.vendorId), b.type, b.name ?? b.vendorId) }); }
  catch (e: any) { return problem(res, 422, 'VENDOR_REFUSED', e.message); }
});
app.post('/v1/vendors/:id/submit', (req, res) => { try { res.json({ vendor: vendorsSvc.submit(req.params.id) }); } catch (e: any) { return problem(res, 404, 'NOT_FOUND', e.message); } });
app.post('/v1/vendors/:id/verification/:step', (req, res) => {
  try { res.json({ vendor: vendorsSvc.decideStep(req.params.id, req.params.step as any, req.body?.decision ?? 'approved', String(req.body?.by ?? 'admin_1')) }); }
  catch (e: any) { return problem(res, 422, 'VERIFICATION_REFUSED', e.message); }
});
app.get('/v1/vendors/:id', (req, res) => { try { res.json({ vendor: vendorsSvc.get(req.params.id), activatable: vendorsSvc.isActivatable(req.params.id) }); } catch (e: any) { return problem(res, 404, 'NOT_FOUND', e.message); } });
app.post('/v1/vendors/:id/subscription', (req, res) => {
  try { res.json({ vendor: vendorsSvc.setSubscription(req.params.id, req.body?.tier, req.body?.commissionOverridePct) }); }
  catch (e: any) { return problem(res, 422, 'SUBSCRIPTION_REFUSED', e.message); }
});

// loyalty
app.get('/v1/loyalty/:userId', (req, res) => res.json(loyaltySvc.statement(req.params.userId)));
app.post('/v1/loyalty/earn', (req, res) => res.json(loyaltySvc.earn(String(req.body?.userId), Number(req.body?.amountMinor ?? 0))));
app.post('/v1/loyalty/redeem', (req, res) => {
  try { res.json(loyaltySvc.redeem(String(req.body?.userId), Number(req.body?.points))); }
  catch (e: any) { return problem(res, 422, 'REDEEM_REFUSED', e.message); }
});

// disputes
app.post('/v1/disputes', (req, res) => {
  const b = req.body ?? {};
  try { res.status(201).json({ dispute: disputesSvc.open({ subject: b.subject, subjectRef: b.subjectRef, reason: b.reason, openedBy: b.openedBy, againstVendor: b.againstVendor, amountInPlayMinor: Number(b.amountInPlayMinor ?? 0), evidence: b.evidence }) }); }
  catch (e: any) { return problem(res, 422, 'DISPUTE_REFUSED', e.message); }
});
app.post('/v1/disputes/:id/:action(acknowledge|review|escalate)', (req, res) => {
  try {
    const a = req.params.action;
    res.json({ dispute: a === 'acknowledge' ? disputesSvc.acknowledge(req.params.id, String(req.body?.officer ?? 'officer_1')) : a === 'review' ? disputesSvc.review(req.params.id) : disputesSvc.escalate(req.params.id) });
  } catch (e: any) { return problem(res, 422, 'DISPUTE_REFUSED', e.message); }
});
app.post('/v1/disputes/:id/resolve', (req, res) => {
  try { res.json({ dispute: disputesSvc.resolve(req.params.id, req.body?.resolution, String(req.body?.by ?? 'officer_1')) }); }
  catch (e: any) { return problem(res, 422, 'RESOLUTION_REFUSED', e.message); }
});
app.post('/v1/disputes/:id/chargeback', (req, res) => {
  try { res.json({ dispute: disputesSvc.chargeback(req.params.id, String(req.body?.psp ?? 'paystack'), Number(req.body?.feeMinor ?? 150_000)) }); }
  catch (e: any) { return problem(res, 422, 'CHARGEBACK_REFUSED', e.message); }
});

// compliance
app.post('/v1/compliance/kyc', (req, res) => res.status(201).json({ kyc: kycSvc.initiate(String(req.body?.userId ?? 'usr_anon'), String(req.body?.bvn ?? ''), String(req.body?.nin ?? '')) }));
app.post('/v1/compliance/aml/screen', (req, res) => res.json({ screen: screen(String(req.body?.name ?? ''), Number(req.body?.transactionCount ?? 0), Number(req.body?.largeCashMinor ?? 0)) }));
app.post('/v1/compliance/privacy/request', (req, res) => {
  const b = req.body ?? {};
  const r = privacySvc.request(String(b.userId ?? 'usr_anon'), b.type ?? 'access');
  if (b.fulfillSystems) { privacySvc.verify(r.id); privacySvc.fulfill(r.id, b.fulfillSystems); }
  res.status(201).json({ request: r });
});
app.get('/v1/compliance/pci', (_req, res) => res.json(pciTracker.readiness()));

// notifications / media / geo / chat
app.post('/v1/notifications/send', async (req, res) => {
  const b = req.body ?? {};
  try { res.json(await notificationsSvc.send({ userId: String(b.userId ?? 'usr_anon'), to: String(b.to ?? ''), channel: b.channel ?? 'fcm', template: b.template, vars: b.vars })); }
  catch (e: any) { return problem(res, 422, 'NOTIFY_REFUSED', e.message); }
});
app.post('/v1/media/presign', (req, res) => {
  const b = req.body ?? {};
  try { res.status(201).json(mediaSvc.presign({ assetClass: b.assetClass, uploadedBy: String(b.uploadedBy ?? 'usr_anon'), filename: String(b.filename ?? ''), bytes: Number(b.bytes ?? 0) })); }
  catch (e: any) { return problem(res, 422, 'PRESIGN_REFUSED', e.message); }
});
app.post('/v1/media/:uploadId/complete', (req, res) => {
  try { res.json({ upload: mediaSvc.complete(req.params.uploadId) }); }
  catch (e: any) { return problem(res, 422, 'UPLOAD_REFUSED', e.message); }
});
app.get('/v1/geo/geocode', (req, res) => res.json(geoSvc.geocode(String(req.query.q ?? ''))));
app.get('/v1/geo/route', (req, res) => {
  const f = String(req.query.from ?? '6.5,3.4').split(',').map(Number);
  const t = String(req.query.to ?? '9.1,7.4').split(',').map(Number);
  res.json(geoSvc.route({ lat: f[0], lng: f[1] }, { lat: t[0], lng: t[1] }));
});
app.post('/v1/chat/rooms', (req, res) => res.status(201).json({ roomId: signaling.createRoom(req.body?.moderators ?? []) }));
app.post('/v1/chat/rooms/:id/join', (req, res) => {
  try { res.json(signaling.join(req.params.id, String(req.body?.participant ?? ''))); } catch (e: any) { return problem(res, 422, 'ROOM_REFUSED', e.message); }
});
app.post('/v1/chat/rooms/:id/signal', (req, res) => {
  const b = req.body ?? {};
  try { res.status(201).json(signaling.signal({ roomId: req.params.id, from: String(b.from ?? ''), to: String(b.to ?? ''), kind: b.kind, encryptedPayload: String(b.encryptedPayload ?? '') })); }
  catch (e: any) { return problem(res, 422, 'SIGNAL_REFUSED', e.message); }
});
app.post('/v1/sms/send', async (req, res) => {
  try { res.json(await smsGateway.send(String(req.body?.to ?? ''), String(req.body?.body ?? ''))); }
  catch (e: any) { return problem(res, 422, 'SMS_REFUSED', e.message); }
});

// verticals
app.get('/v1/verticals/catalog', (_req, res) => res.json({
  aviation: { aircraftTypes: AIRCRAFT_TYPES },
  hotels: { roomTypes: ROOM_TYPES },
  tourism: { experiences: EXPERIENCES },
  security: { services: SECURITY_SERVICES },
  roadside: { services: ROADSIDE_RATES },
  intercity: { routes: INTERCITY_ROUTES },
  marine: { vessels: MARINE_VESSELS },
  corporate: { services: CORPORATE_SERVICES },
}));
app.post('/v1/verticals/:vertical/quote', (req, res) => {
  const b = req.body ?? {};
  try {
    res.json({ quotes: verticalEngine(req.params.vertical).quote(req.params.vertical, {
      customerId: String(b.customerId ?? 'cus_anon'),
      priceOf: (p) => Number(b.basePriceMinor ?? 5_000_000) * (6 - Math.round(p.rating)),
      etaOf: () => String(b.schedule ?? 'T+2h'),
      famsCtx: { country: b.country ?? 'NG', state: b.state, userGroups: ['customers'] },
    }) });
  } catch (e: any) { return problem(res, 403, 'FEATURE_DISABLED', e.message); }
});
app.post('/v1/verticals/:vertical/book', (req, res) => {
  const b = req.body ?? {};
  try {
    res.status(201).json({ booking: verticalEngine(req.params.vertical).book(req.params.vertical, {
      providerId: String(b.providerId ?? ''), customerId: String(b.customerId ?? 'cus_anon'),
      priceMinor: Number(b.priceMinor ?? 5_000_000), details: b.details ?? {},
      famsCtx: { country: b.country ?? 'NG', state: b.state, userGroups: ['customers'] },
    }) });
  } catch (e: any) { return problem(res, 403, 'BOOKING_REFUSED', e.message); }
});
// ─── WhatsApp Smart AI Customer Service Platform (docs/26) ──────────────────
app.post('/v1/verticals/bookings/:id/:action(complete|cancel)', (req, res) => {
  const engine = [...verticalEngines.values()].find((e) => e.get(req.params.id));
  if (!engine) return problem(res, 404, 'NOT_FOUND', 'booking not found');
  try { res.json({ booking: req.params.action === 'complete' ? engine.complete(req.params.id) : engine.cancel(req.params.id) }); }
  catch (e: any) { return problem(res, 422, 'BOOKING_REFUSED', e.message); }
});

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
