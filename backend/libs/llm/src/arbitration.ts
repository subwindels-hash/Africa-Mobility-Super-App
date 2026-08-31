/**
 * Arbitration — "LLM proposes, engines validate" (docs/26, same pattern as
 * the fare engine): the deterministic NLU core is the source of truth; a
 * provider proposal is only adopted if it passes schema validation AND the
 * adoption policy. Every decision is logged for the audit trail.
 */

export interface CoreResult {
  intent: string;
  confidence: number;
  language: string;
  entities: Record<string, unknown>;
}

export interface ArbitrationDecision {
  adopted: 'core' | 'llm' | 'merged' | 'neither';
  intent: string;
  confidence: number;
  entities: Record<string, unknown>;
  reasons: string[];
}

export const ARBITRATION_POLICY = {
  /** LLM self-reported confidence must be at least this to be considered. */
  minLlmConfidence: 0.6,
  /** Below this the deterministic core is treated as a coin-flip. */
  weakCoreConfidence: 0.55,
  /** Above this the core is authoritative — LLM may only add entities. */
  strongCoreConfidence: 0.75,
} as const;

/** Valid intent vocabulary — supplied by the NLU engine at wire-up. */
export class IntentVocabulary {
  private readonly set: Set<string>;
  constructor(intents: Iterable<string>) { this.set = new Set(intents); }
  isValid(intent: string): boolean { return this.set.has(intent); }
}

/** Validate + coerce a proposed entity value against the slot schema. */
export function validateEntity(slot: string, value: unknown): { ok: boolean; value?: unknown; reason?: string } {
  switch (slot) {
    case 'passengers':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 9) {
        return { ok: false, reason: `passengers must be integer 1-9, got ${JSON.stringify(value)}` };
      }
      return { ok: true, value };
    case 'datetime': {
      const dt = value as { raw?: string; iso?: string };
      if (!dt || typeof dt !== 'object' || (typeof dt.raw !== 'string' && typeof dt.iso !== 'string')) {
        return { ok: false, reason: 'datetime must be {raw} or {iso}' };
      }
      return { ok: true, value: dt };
    }
    case 'serviceClass': {
      const cls = String(value).toLowerCase();
      if (!['economy', 'standard', 'premium', 'luxury', 'vip', 'business', 'first_class', 'chauffeur'].includes(cls)) {
        return { ok: false, reason: `unknown serviceClass '${cls}'` };
      }
      return { ok: true, value: cls === 'first_class' ? 'first class' : cls };
    }
    case 'origin':
    case 'destination': {
      const loc = value as { raw?: string; lat?: number; lng?: number; label?: string };
      if (!loc || typeof loc !== 'object' || (typeof loc.raw !== 'string' && typeof loc.label !== 'string' && typeof loc.lat !== 'number')) {
        return { ok: false, reason: `${slot} must be {raw|label|lat,lng}` };
      }
      return { ok: true, value: loc };
    }
    case 'item':
    case 'cargoType': {
      const s = String(value);
      if (s.length < 2 || s.length > 80) return { ok: false, reason: `${slot} length 2-80` };
      return { ok: true, value: s };
    }
    default:
      return { ok: false, reason: `unknown slot '${slot}' — proposal rejected (schema-closed)` };
  }
}

/**
 * Decide whose answer wins. Policy (engines validate, LLM assists):
 *  1. Invalid proposal (bad intent / schema violations) → core, reasons logged.
 *  2. Core strong → core intent; LLM entities merged if valid ('merged').
 *  3. Core weak & LLM confident & valid → LLM ('llm').
 *  4. Both weak → core with low confidence — dialog will ask a clarifying
 *     question / escalate per the existing escalation policy.
 */
export function arbitrate(
  core: CoreResult,
  proposal: { intent: string; confidence: number; entities: Record<string, unknown> },
  vocab: IntentVocabulary,
): ArbitrationDecision {
  const reasons: string[] = [];

  // 1. proposal validity
  if (!vocab.isValid(proposal.intent)) {
    reasons.push(`proposal intent '${proposal.intent}' not in vocabulary`);
    return { ...pack(core), adopted: 'core', reasons };
  }
  if (proposal.confidence < ARBITRATION_POLICY.minLlmConfidence) {
    reasons.push(`proposal confidence ${proposal.confidence.toFixed(2)} < ${ARBITRATION_POLICY.minLlmConfidence}`);
    return { ...pack(core), adopted: 'core', reasons };
  }
  const validatedEntities: Record<string, unknown> = {};
  for (const [slot, value] of Object.entries(proposal.entities ?? {})) {
    const v = validateEntity(slot, value);
    if (v.ok) validatedEntities[slot] = v.value;
    else reasons.push(`entity '${slot}' rejected: ${v.reason}`);
  }

  // 2. strong core → core intent, merge validated entities
  if (core.confidence >= ARBITRATION_POLICY.strongCoreConfidence) {
    const merged = { ...core.entities, ...validatedEntities };
    const mergedAny = Object.keys(validatedEntities).length > 0;
    if (core.intent === proposal.intent) reasons.push('core and LLM agree');
    else reasons.push(`core strong (${core.confidence.toFixed(2)}) — keeps intent '${core.intent}', LLM entities merged`);
    return {
      adopted: mergedAny ? 'merged' : 'core',
      intent: core.intent,
      confidence: Math.min(1, core.confidence + (core.intent === proposal.intent ? 0.05 : 0)),
      entities: merged,
      reasons,
    };
  }

  // 3. weak core, confident LLM → adopt LLM
  if (core.confidence < ARBITRATION_POLICY.weakCoreConfidence) {
    reasons.push(`core weak (${core.confidence.toFixed(2)}) — adopting LLM '${proposal.intent}' (${proposal.confidence.toFixed(2)})`);
    return {
      adopted: 'llm',
      intent: proposal.intent,
      confidence: proposal.confidence,
      entities: { ...core.entities, ...validatedEntities },
      reasons,
    };
  }

  // 4. middle band: core keeps intent, entities merge if any
  reasons.push(`core middling (${core.confidence.toFixed(2)}) — keeps intent, LLM entities merged`);
  return {
    adopted: Object.keys(validatedEntities).length ? 'merged' : 'core',
    intent: core.intent,
    confidence: core.confidence,
    entities: { ...core.entities, ...validatedEntities },
    reasons,
  };
}

function pack(core: CoreResult): { intent: string; confidence: number; entities: Record<string, unknown> } {
  return { intent: core.intent, confidence: core.confidence, entities: { ...core.entities } };
}
