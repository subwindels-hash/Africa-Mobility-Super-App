import { FamsEngine, PLATFORM_MODULES, VERTICAL_MODULE } from './engine';

/**
 * FAMS launch presets — seeded to the spec's phased plan. Admins change these
 * at runtime; nothing here requires a deploy.
 */

export const PHASES: Record<number, { name: string; enable: string[] }> = {
  1: { name: 'Phase 1 — Nigeria core', enable: ['transportation', 'taxi', 'dispatch', 'logistics', 'wallet', 'escrow', 'whatsapp_ai'] },
  2: { name: 'Phase 2 — Travel & stay', enable: ['travel', 'flights', 'hotels', 'accommodation', 'corporate_services', 'roadside'] },
  3: { name: 'Phase 3 — Security marketplace', enable: ['security', 'security_marketplace'] },
  4: { name: 'Phase 4 — Aviation', enable: ['aviation'] },
  5: { name: 'Phase 5 — Marine services', enable: ['marine'] },
};

const ALL_VERTICALS = ['transportation', 'logistics', 'travel', 'hotels', 'corporate_services', 'roadside', 'security', 'aviation', 'marine', 'tourism'];

// modules that follow a phase but are not verticals (platform switches)
const PHASE_MODULES: Record<number, string[]> = {
  1: ['delivery', 'voice_calls', 'chat', 'ai_features'],
  2: ['video_calls'],
  // marine module switch flips with the marine vertical at phase 5.
  // NOTE: tourism is deliberately NOT in any phase — the spec vision lists it
  // but the phase plan doesn't schedule it, so it stays OFF until an admin
  // activates it through FAMS (the no-code-change activation promise).
};

/** Seed the engine: global defaults at the given phase + spec demo rules. */
export function seedFams(engine: FamsEngine, activePhase = 4): void {
  // global vertical defaults through `activePhase`
  const enabled = new Set<string>(['wallet', 'escrow', 'whatsapp_ai', 'loyalty', 'subscriptions', 'promotions']);
  for (let p = 1; p <= activePhase; p++) PHASES[p].enable.forEach((v) => enabled.add(v));
  for (const v of ALL_VERTICALS) {
    engine.upsertRule({
      level: 'global',
      target: { kind: 'vertical', code: v },
      value: enabled.has(v) ? 'on' : 'off',
      note: enabled.has(v) ? `live since phase ${phaseOf(v)}` : 'built, awaiting launch phase',
      updatedBy: 'seed',
    });
  }

  // global module switches (25-module catalog) — vertical-governed modules are
  // expressed through their vertical rules above; independent switches here
  const governed = new Set(Object.values(VERTICAL_MODULE));
  for (const m of PLATFORM_MODULES) {
    if (governed.has(m)) continue;
    const phase = phaseOfModule(m);
    const on = phase <= activePhase;
    engine.upsertRule({
      level: 'global', target: { kind: 'module', code: m },
      value: on ? 'on' : 'off',
      note: on ? `${m} live` : `${m} built — activates at phase ${phase}`,
      updatedBy: 'seed',
    });
  }

  // ── spec demo rules (country/state/city/category/user-group/geofence) ──

  // Kenya: transportation & logistics off (country control)
  engine.upsertRule({ level: 'country', selector: 'KE', target: { kind: 'vertical', code: 'transportation' }, value: 'off', note: 'Kenya launch pending', updatedBy: 'seed' });
  engine.upsertRule({ level: 'country', selector: 'KE', target: { kind: 'vertical', code: 'logistics' }, value: 'off', note: 'Kenya launch pending', updatedBy: 'seed' });
  // Ghana: security off, travel off (spec country example)
  engine.upsertRule({ level: 'country', selector: 'GH', target: { kind: 'vertical', code: 'security' }, value: 'off', note: 'Phase 3 Ghana pending licensing', updatedBy: 'seed' });
  engine.upsertRule({ level: 'country', selector: 'GH', target: { kind: 'vertical', code: 'travel' }, value: 'off', note: 'Ghana GDS contracts pending', updatedBy: 'seed' });

  // Edo state: aviation + travel off (spec state example: Edo — taxi ON, travel OFF)
  engine.upsertRule({ level: 'state', selector: 'NG-ED', target: { kind: 'vertical', code: 'aviation' }, value: 'off', note: 'NCAA ops clearance pending in Edo', updatedBy: 'seed' });
  engine.upsertRule({ level: 'state', selector: 'NG-ED', target: { kind: 'vertical', code: 'travel' }, value: 'off', note: 'Edo travel pending OTA licensing', updatedBy: 'seed' });

  // Benin City: security off (spec city example: taxi ON, dispatch ON, hotels ON, security OFF)
  engine.upsertRule({ level: 'city', selector: 'NG-BNI', target: { kind: 'vertical', code: 'security' }, value: 'off', note: 'Benin City security licensing', updatedBy: 'seed' });
  // Asaba: aviation off (city control example)
  engine.upsertRule({ level: 'city', selector: 'NG-ASB', target: { kind: 'vertical', code: 'aviation' }, value: 'off', note: 'Asaba airspace restrictions', updatedBy: 'seed' });

  // Category control: VIP taxi off globally while fleet is trained (category control example)
  engine.upsertRule({ level: 'category', target: { kind: 'category', code: 'ride.vip' }, value: 'maintenance', note: 'VIP fleet in training — returns soon', updatedBy: 'seed' });

  // Vendor control examples: suspended / maintenance / pending-review
  engine.upsertRule({ level: 'vendor', selector: 'vnd_b', target: { kind: 'vertical', code: 'transportation' }, value: 'off', note: 'Vendor B suspended — insurance expired', updatedBy: 'seed' });
  engine.upsertRule({ level: 'vendor', selector: 'vnd_c', target: { kind: 'vertical', code: 'transportation' }, value: 'maintenance', note: 'Vendor C maintenance mode', updatedBy: 'seed' });
  engine.upsertRule({ level: 'vendor', selector: 'vnd_d', target: { kind: 'vertical', code: 'transportation' }, value: 'hidden', note: 'Vendor D pending review', updatedBy: 'seed' });

  // Asset control example: jet_b disabled
  engine.upsertRule({ level: 'asset', selector: 'ast_jet_b', target: { kind: 'vertical', code: 'aviation' }, value: 'off', note: 'Jet B airworthiness check', updatedBy: 'seed' });

  // User-group activation: next-gen assistant only for beta + vip (base off, group on)
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'ai.assistant_next_gen' }, value: 'off', note: 'Next-gen assistant — closed preview', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'ai.assistant_next_gen' }, value: 'on', userGroups: ['beta', 'vip'], note: 'Beta + VIP preview', updatedBy: 'seed' });

  // Feature flags per spec (ON by default)
  for (const f of ['ai.dynamic_pricing', 'whatsapp.ai', 'comms.video', 'comms.voice', 'comms.chat', 'wallet', 'escrow', 'tracking.live', 'portal.corporate']) {
    engine.upsertRule({ level: 'global', target: { kind: 'feature', code: f }, value: 'on', updatedBy: 'seed' });
  }

  // Seasonal promotion: rides promo ends 31 Jan 2027 (time-based)
  engine.upsertRule({
    level: 'global', target: { kind: 'feature', code: 'promo.ride20' }, value: 'on',
    endsAt: new Date('2027-01-31T23:59:00Z'), note: 'Seasonal promo auto-expires', updatedBy: 'seed',
  });

  // ── autonomous mobility (docs/31): spec example states ──
  // Self-Driving = OFF · Autonomous Delivery = OFF (awaiting legal approval)
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'mob.self_driving' }, value: 'off', note: 'Requires legal approval per jurisdiction — never default-on', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'mob.autonomous_delivery' }, value: 'off', note: 'Autonomous delivery awaiting regulatory clearance', updatedBy: 'seed' });
  // AI Driver Assistance = ON · AI Vehicle Tracking = ON
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'mob.driver_assist' }, value: 'on', note: 'AI driver assistance available', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'mob.tracking' }, value: 'on', note: 'AI vehicle tracking live', updatedBy: 'seed' });
  // Operating-mode control example: supervised autonomy permitted only in a pilot road zone
  engine.upsertRule({ level: 'road_zone', selector: 'zone:NG-LAG-EKO-ATLANTIC', target: { kind: 'feature', code: 'mob.supervised_autonomy' }, value: 'on', note: 'Supervised-autonomy pilot corridor (Eko Atlantic)', updatedBy: 'seed' });

  // ── Interstate Logistics & Long-Distance Freight (docs/32) ────────────────
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'ilst.marketplace' }, value: 'on', note: 'Nationwide interstate logistics marketplace — launch', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'ilst.cold_chain' }, value: 'on', note: 'Refrigerated logistics live', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'ilst.corporate' }, value: 'on', note: 'Corporate logistics accounts live', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'ilst.permitted_cargo' }, value: 'off', note: 'Livestock/heavy-haul — only where legally permitted (state-level activation)', updatedBy: 'seed' });
  engine.upsertRule({ level: 'state', selector: 'NG-KAN', target: { kind: 'feature', code: 'ilst.permitted_cargo' }, value: 'on', note: 'Livestock transport permitted & certified in Kano', updatedBy: 'seed' });
  engine.upsertRule({ level: 'state', selector: 'NG-KAD', target: { kind: 'feature', code: 'ilst.permitted_cargo' }, value: 'on', note: 'Livestock transport permitted & certified in Kaduna', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'ilst.cross_border' }, value: 'off', note: 'Cross-Border African Logistics — future phase', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'category', code: 'veh.tanker' }, value: 'off', note: 'Tanker (fuel/chemicals) pending HSE compliance review', updatedBy: 'seed' });
  engine.upsertRule({ level: 'global', target: { kind: 'feature', code: 'mob.supervised_autonomy' }, value: 'off', note: 'Supervised autonomy OFF outside approved corridors', updatedBy: 'seed' });

  // Geofenced activation: airport transfer category only inside MMIA fence (15km)
  engine.upsertRule({
    level: 'category', target: { kind: 'category', code: 'transfer.airport' }, value: 'on',
    geofence: { lat: 6.5774, lng: 3.3212, radiusM: 15000 },
    note: 'Geofenced: MMIA 15km — outside fence falls back to standard taxi', updatedBy: 'seed',
  });
}

function phaseOf(v: string): number {
  for (const [p, conf] of Object.entries(PHASES)) if (conf.enable.includes(v)) return Number(p);
  return 1;
}

function phaseOfModule(m: string): number {
  for (const [p, mods] of Object.entries(PHASE_MODULES)) if ((mods as string[]).includes(m)) return Number(p);
  for (const [p, conf] of Object.entries(PHASES)) if (conf.enable.includes(m)) return Number(p);
  return 1;
}

/** Process-wide singleton (Redis-backed registry in production). */
export const fams = new FamsEngine();
let seeded = false;
export function ensureSeeded(phase = 4): FamsEngine {
  if (!seeded) { seedFams(fams, phase); seeded = true; }
  return fams;
}
