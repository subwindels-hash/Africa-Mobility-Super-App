/**
 * AMSA Feature Activation Management System (FAMS) — docs/28.
 * Core platform control plane: every request passes through the Feature
 * Activation Engine before touching the booking engine.
 *
 * Precedence (most specific wins):
 *   asset > vendor > category > city > state > country > global
 *   (user-group-scoped rules get a specificity bonus over plain rules)
 * At equal precedence the MOST RECENT admin decision wins (override semantics).
 *
 * Conditional semantics:
 *   - not-yet-started rule  → skipped (parent level decides)
 *   - expired ON rule       → effective OFF (seasonal auto-expiry)
 *   - geofence rule, user outside fence → effective OFF
 *   - user-group / rollout% exclusion    → feature visible but unavailable to you
 * Emergency kill switch overrides everything.
 */

export type FamsValue = 'on' | 'off' | 'hidden' | 'maintenance' | 'beta';
export type FamsLevel = 'global' | 'country' | 'state' | 'city' | 'road_zone' | 'category' | 'vendor' | 'fleet' | 'vehicle' | 'asset';
export type FamsTargetKind = 'module' | 'vertical' | 'category' | 'feature';

export interface FamsRule {
  id: string;
  level: FamsLevel;
  selector?: string;                    // country/state/city code, category code, vendorId, assetId
  target: { kind: FamsTargetKind; code: string };
  value: FamsValue;
  userGroups?: string[];                // rule applies ONLY to these groups (beta/vip gating)
  rolloutPct?: number;                  // deterministic % of userIds (1-100)
  startsAt?: Date; endsAt?: Date;       // time window (seasonal / scheduled activation)
  geofence?: { lat: number; lng: number; radiusM: number };
  note?: string;
  updatedBy?: string;
  updatedAt: Date;
  _v?: number;                          // monotonic version (recency tie-break)
}

export interface EmergencyStop {
  targetKey: string; stoppedAt: Date; by: string; reason: string;
}

export interface ScheduledActivation {
  id: string;
  action: 'set_value' | 'emergency_stop' | 'emergency_clear';
  level: FamsLevel; selector?: string;
  target: { kind: FamsTargetKind; code: string };
  value?: FamsValue;
  runAt: Date;
  note?: string;
  executedAt?: Date;
}

export interface FamsContext {
  country?: string; state?: string; city?: string; roadZone?: string;
  vendorId?: string; fleetId?: string; vehicleId?: string; assetId?: string;
  userGroups?: string[];
  userId?: string;
  location?: { lat: number; lng: number };
  now?: Date;
}

export interface FamsDecision {
  value: FamsValue;
  available: boolean;
  source: string;                       // rule id | 'emergency_stop' | 'default'
  reason?: string;
}

const LEVEL_WEIGHT: Record<FamsLevel, number> = {
  asset: 70, vehicle: 75, fleet: 65, vendor: 60, category: 50, road_zone: 45, city: 40, state: 30, country: 20, global: 10,
};
const GROUP_BONUS = 15;

export const CATEGORY_VERTICAL: Record<string, string> = {
  ride: 'transportation', transfer: 'transportation', transport: 'transportation', taxi: 'transportation',
  logistics: 'logistics', dispatch: 'logistics', parcel: 'logistics', courier: 'logistics',
  flight: 'travel', travel: 'travel', domestic: 'travel', international: 'travel',
  jet: 'aviation', heli: 'aviation', air: 'aviation', aviation: 'aviation',
  marine: 'marine', boat: 'marine',
  security: 'security',
  roadside: 'roadside',
  hotel: 'accommodation', apartment: 'accommodation', shortlet: 'accommodation', vacation: 'accommodation',
  tourism: 'tourism', tour: 'tourism',
  corporate: 'corporate_services',
};

export function verticalOfCategory(code: string): string | undefined {
  return CATEGORY_VERTICAL[code.split('.')[0]];
}

function bucket(userId: string | undefined, salt: string): number {
  if (!userId) return 0;
  let h = 0;
  const s = `${salt}:${userId}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100;
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const PLATFORM_MODULES = [
  'transportation', 'taxi', 'dispatch', 'logistics', 'delivery', 'travel', 'flights', 'hotels',
  'accommodation', 'roadside', 'security_marketplace', 'aviation', 'marine', 'corporate_services',
  'wallet', 'escrow', 'loyalty', 'subscriptions', 'promotions', 'whatsapp_ai', 'ai_features',
  'video_calls', 'voice_calls', 'chat', 'tourism',
  // autonomous mobility (docs/31) — tracking live, autonomy OFF by default
  'vehicle_tracking', 'driver_assistance', 'self_driving', 'autonomous_delivery',
] as const;

/** Spec user groups — features can be scoped to any combination. */
export const USER_GROUPS = ['customers', 'drivers', 'riders', 'vendors', 'corporate', 'beta', 'vip'] as const;

/** Spec asset classes — each independently switchable (per class or per unit). */
export const ASSET_TYPES = ['car', 'motorcycle', 'dispatch_bike', 'helicopter', 'private_jet', 'charter_aircraft', 'boat', 'yacht'] as const;

/** Spec vendor lifecycle states → engine values. */
export const VENDOR_STATES = ['active', 'suspended', 'pending_review', 'maintenance', 'disabled'] as const;
export const VENDOR_STATE_VALUE: Record<string, FamsValue> = {
  active: 'on', suspended: 'off', pending_review: 'hidden', maintenance: 'maintenance', disabled: 'off',
};

export const VERTICAL_MODULE: Record<string, string> = {
  transportation: 'transportation', logistics: 'logistics', travel: 'travel',
  aviation: 'aviation', marine: 'marine', security: 'security_marketplace',
  corporate_services: 'corporate_services', roadside: 'roadside', accommodation: 'hotels',
  tourism: 'tourism',
};

interface Candidate {
  rule: FamsRule;
  effective: FamsValue;   // value after expiry/geofence semantics
  softExcluded: boolean;  // user-group / rollout exclusion
  weight: number;         // level weight + group bonus
}

export class FamsEngine {
  private rules = new Map<string, FamsRule>();
  private emergencies = new Map<string, EmergencyStop>();
  private schedules: ScheduledActivation[] = [];
  private seq = 0;

  // ── administration ──
  upsertRule(r: Omit<FamsRule, 'id' | 'updatedAt'> & { id?: string }): FamsRule {
    const id = r.id ?? `fams_${++this.seq}`;
    const rule: FamsRule = { ...r, id, updatedAt: new Date(), _v: ++this.seq } as FamsRule;
    this.rules.set(id, rule);
    return rule;
  }
  deleteRule(id: string): boolean { return this.rules.delete(id); }
  listRules(filter?: { targetCode?: string; level?: FamsLevel }): FamsRule[] {
    return [...this.rules.values()]
      .filter((r) => (!filter?.targetCode || r.target.code === filter.targetCode) && (!filter?.level || r.level === filter.level))
      .sort((a, b) => LEVEL_WEIGHT[b.level] - LEVEL_WEIGHT[a.level]);
  }
  setEmergency(targetKey: string, on: boolean, by: string, reason: string): void {
    if (on) this.emergencies.set(targetKey, { targetKey, stoppedAt: new Date(), by, reason });
    else this.emergencies.delete(targetKey);
  }
  listEmergencies(): EmergencyStop[] { return [...this.emergencies.values()]; }
  schedule(sa: Omit<ScheduledActivation, 'id' | 'executedAt' | 'action'> & { id?: string; action?: ScheduledActivation['action'] }): ScheduledActivation {
    const s: ScheduledActivation = { action: 'set_value', ...sa, id: sa.id ?? `sched_${++this.seq}` } as ScheduledActivation;
    this.schedules.push(s);
    return s;
  }
  listSchedules(): ScheduledActivation[] { return [...this.schedules]; }

  /** Scheduler tick — applies due one-shot activations (cron in production). */
  tick(now = new Date()): ScheduledActivation[] {
    const applied: ScheduledActivation[] = [];
    for (const s of this.schedules) {
      if (!s.executedAt && s.runAt <= now) {
        if (s.action === 'set_value') {
          this.upsertRule({ level: s.level, selector: s.selector, target: s.target, value: s.value!, note: s.note ?? `scheduled ${s.id}`, updatedBy: 'scheduler' });
        } else if (s.action === 'emergency_stop') {
          this.setEmergency(`${s.target.kind}:${s.target.code}`, true, 'scheduler', s.note ?? 'scheduled stop');
        } else {
          this.setEmergency(`${s.target.kind}:${s.target.code}`, false, 'scheduler', 'scheduled clear');
        }
        s.executedAt = now;
        applied.push(s);
      }
    }
    return applied;
  }

  // ── evaluation ──
  evaluate(kind: FamsTargetKind, code: string, ctx: FamsContext): FamsDecision {
    const targetKey = `${kind}:${code}`;
    const stop = this.emergencies.get(targetKey) ?? this.emergencies.get(`module:${code}`);
    if (stop) {
      return { value: 'off', available: false, source: 'emergency_stop', reason: `Emergency stop by ${stop.by}: ${stop.reason}` };
    }

    // candidate targets: exact + inherited vertical/module
    const vertical = kind === 'category' ? verticalOfCategory(code) : undefined;
    const moduleCode = kind === 'vertical' ? VERTICAL_MODULE[code] : (kind === 'category' && vertical ? VERTICAL_MODULE[vertical] : undefined);
    const candidates: Candidate[] = [];
    const now = ctx.now ?? new Date();

    for (const r of this.rules.values()) {
      const exact = r.target.kind === kind && r.target.code === code;
      const inherited =
        (kind === 'category' && r.target.kind === 'vertical' && r.target.code === vertical) ||
        (kind === 'vertical' && r.target.kind === 'module' && r.target.code === moduleCode) ||
        (kind === 'category' && r.target.kind === 'module' && r.target.code === moduleCode);
      if (!exact && !inherited) continue;

      // selector (scope) match
      if (r.level === 'country' && r.selector !== ctx.country) continue;
      if (r.level === 'state' && r.selector !== ctx.state) continue;
      if (r.level === 'city' && r.selector !== ctx.city) continue;
      if (r.level === 'road_zone' && r.selector !== ctx.roadZone) continue;
      if (r.level === 'vendor' && r.selector !== ctx.vendorId) continue;
      if (r.level === 'fleet' && r.selector !== ctx.fleetId) continue;
      if (r.level === 'vehicle' && r.selector !== ctx.vehicleId) continue;
      if (r.level === 'asset' && r.selector !== ctx.assetId) continue;

      // time semantics
      if (r.startsAt && now < r.startsAt) continue;              // not yet started → parent decides
      let effective = r.value;
      if (r.endsAt && now > r.endsAt) {
        if (r.value === 'on') effective = 'off';                 // expired activation → off
        else continue;                                           // expired suspension → revert to parent
      }

      // geofence semantics: outside fence → the rule grants nothing → OFF
      if (r.geofence) {
        if (!ctx.location) continue;                             // unknown position → parent decides
        if (distanceM(ctx.location, r.geofence) > r.geofence.radiusM) effective = 'off';
      }

      // soft cohort filters (user groups / rollout %)
      let softExcluded = false;
      if (r.userGroups && r.userGroups.length > 0) {
        const mine = ctx.userGroups ?? [];
        if (!r.userGroups.some((g) => mine.includes(g))) softExcluded = true;
      }
      if (r.rolloutPct !== undefined && r.rolloutPct < 100) {
        if (bucket(ctx.userId, targetKey) >= r.rolloutPct) softExcluded = true;
      }

      candidates.push({
        rule: r, effective, softExcluded,
        weight: LEVEL_WEIGHT[r.level] + (r.userGroups && r.userGroups.length > 0 ? GROUP_BONUS : 0),
      });
    }

    if (candidates.length === 0) {
      return { value: 'on', available: true, source: 'default', reason: 'no matching rule — platform default on' };
    }

    const rank = (a: Candidate, b: Candidate) => b.weight - a.weight || (b.rule._v ?? 0) - (a.rule._v ?? 0);
    const eligible = candidates.filter((c) => !c.softExcluded).sort(rank);
    const winner = eligible[0] ?? candidates.sort(rank)[0];

    if (winner.softExcluded) {
      // feature exists but this user isn't in the cohort (beta/vip/rollout %)
      return { value: winner.effective, available: false, source: winner.rule.id, reason: `not in activation cohort (${winner.rule.userGroups ? winner.rule.userGroups.join('/') : `${winner.rule.rolloutPct}% rollout`})` };
    }
    return {
      value: winner.effective,
      available: winner.effective === 'on' || winner.effective === 'beta',
      source: winner.rule.id,
      reason: winner.rule.note ?? `${winner.rule.level}${winner.rule.selector ? `:${winner.rule.selector}` : ''} → ${winner.effective}`,
    };
  }

  verticalAvailable(vertical: string, ctx: FamsContext): boolean {
    return this.evaluate('vertical', vertical, ctx).available;
  }

  availabilityMatrix(ctx: FamsContext, verticals: string[]): Record<string, FamsDecision> {
    const out: Record<string, FamsDecision> = {};
    for (const v of verticals) out[v] = this.evaluate('vertical', v, ctx);
    return out;
  }

  /**
   * Spec middleware workflow, as an inspectable trace:
   *   User Request → Location Validation → Country → State → City →
   *   Feature Flag → Vendor → Booking Engine
   * Each stage reports the rule that governs it (deepest scope wins overall —
   * a city-ON rule legitimately overrides a state-OFF rule; the trace shows
   * every contribution so ops can see WHY a request was allowed or blocked).
   */
  evaluatePipeline(kind: FamsTargetKind, code: string, ctx: FamsContext): { stages: PipelineStage[]; decision: FamsDecision } {
    const vertical = kind === 'category' ? verticalOfCategory(code) : kind === 'vertical' ? code : undefined;
    const moduleCode = kind === 'module' ? code : vertical ? VERTICAL_MODULE[vertical] : undefined;
    const matches = (r: FamsRule) =>
      (r.target.kind === kind && r.target.code === code) ||
      (vertical && r.target.kind === 'vertical' && r.target.code === vertical) ||
      (moduleCode && r.target.kind === 'module' && r.target.code === moduleCode);

    const byLevel = (level: FamsLevel) =>
      [...this.rules.values()].filter((r) => matches(r) && r.level === level)
        .sort((a, b) => (b._v ?? 0) - (a._v ?? 0))[0];

    const stage = (name: string, level: FamsLevel | null, extra?: Partial<PipelineStage>): PipelineStage => {
      if (!level) return { stage: name, checked: true, ruleId: null, ...extra };
      const r = byLevel(level);
      return {
        stage: name, checked: true,
        selector: r?.selector, ruleId: r?.id ?? null, value: r?.value,
        note: r ? r.note ?? `${r.level}${r.selector ? `:${r.selector}` : ''} → ${r.value}` : `no ${level}-level rule — inherits`,
        ...extra,
      };
    };

    const decision = this.evaluate(kind, code, ctx);
    const stages: PipelineStage[] = [
      {
        stage: 'location',
        checked: true,
        note: `resolved ${[ctx.city, ctx.state, ctx.country].filter(Boolean).join(' / ') || 'country unknown → platform default'}${ctx.location ? ` · geo ${ctx.location.lat.toFixed(4)},${ctx.location.lng.toFixed(4)}` : ''}`,
      },
      stage('country', 'country'),
      stage('state', 'state'),
      stage('city', 'city'),
      stage('feature-flag', 'global', { note: byLevel('global') ? undefined : 'no global/module rule — platform default on' }),
      ctx.vendorId ? stage('vendor', 'vendor') : { stage: 'vendor', checked: false, ruleId: null, note: 'no vendor on request' },
      { stage: 'booking-engine', checked: decision.available, ruleId: decision.source, value: decision.value, note: decision.available ? 'allowed — proceed to booking engine' : UNAVAILABLE_MESSAGE },
    ];
    return { stages, decision };
  }
}

export interface PipelineStage {
  stage: string;                        // location | country | state | city | feature-flag | vendor | booking-engine
  checked: boolean;
  ruleId?: string | null;
  selector?: string;
  value?: FamsValue;
  note?: string;
}

export const UNAVAILABLE_MESSAGE = 'Service is currently unavailable in your location.';
