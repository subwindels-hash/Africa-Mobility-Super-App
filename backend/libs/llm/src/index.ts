/**
 * AMSA LLM Orchestration Layer — docs/26 §LLM Orchestration.
 *
 * Sits at the WhatsApp NLU seam. The deterministic NLU engine classifies
 * first (fast, offline, testable); the orchestration layer then:
 *   1. guardrail-checks the utterance (refusals short-circuit to escalation,
 *      never to a model),
 *   2. redacts PII before anything leaves the platform,
 *   3. asks the provider for a *proposal*,
 *   4. validates + arbitrates it against the core ("LLM proposes, engines
 *      validate"),
 *   5. records an audit-trail entry for /admin/whatsapp observability.
 *
 * Default provider is offline (HeuristicProvider) — production plugs real
 * model endpoints behind the same LlmProvider interface (CascadeProvider
 * for per-task routing / fallback).
 */
import {
  ARBITRATION_POLICY, arbitrate, IntentVocabulary,
  type ArbitrationDecision,
} from './arbitration';
import { checkRefusal, redactPii, refusalReply, type RefusalCheck } from './guardrails';
import { HeuristicProvider, type LlmProvider, type LlmProposalInput } from './providers';

export { ARBITRATION_POLICY, arbitrate, IntentVocabulary, validateEntity } from './arbitration';
export { checkRefusal, redactPii, refusalReply } from './guardrails';
export { HeuristicProvider, CascadeProvider } from './providers';
export type { LlmProvider, LlmProposal, LlmProposalInput } from './providers';
export type { ArbitrationDecision } from './arbitration';

export interface EnhanceOptions {
  missingSlots?: string[];
  channel?: LlmProposalInput['channel'];
  /** Force/skip the LLM for this one call ('off' | 'assist' | 'always'). */
  mode?: 'off' | 'assist' | 'always';
}

export interface EnhanceResult {
  /** Final NLU result to route on (intent/entities may be arbitrated). */
  intent: string;
  confidence: number;
  language: string;
  entities: Record<string, unknown>;
  decision: ArbitrationDecision['adopted'] | 'refused' | 'skipped';
  reasons: string[];
  /** Set when the guardrail refused — reply with refusalReply() instead. */
  refusal?: RefusalCheck;
}

export interface AuditEntry {
  at: string;
  channel: string;
  redactedText: string;
  coreIntent: string;
  coreConfidence: number;
  proposalIntent?: string;
  proposalConfidence?: number;
  provider?: string;
  decision: EnhanceResult['decision'];
  reasons: string[];
  latencyMs: number;
}

export interface LlmStats {
  consultations: number;
  proposals: number;
  accepted: number;     // adopted: 'llm' | 'merged'
  rejected: number;     // adopted: 'core'
  refusals: number;
  redactions: number;
  providerErrors: number;
}

const AUDIT_LIMIT = 200;

export type LlmMode = 'off' | 'assist' | 'always';

export class LlmOrchestrator {
  private provider: LlmProvider;
  private vocab: IntentVocabulary;
  private mode: LlmMode;
  readonly stats: LlmStats = { consultations: 0, proposals: 0, accepted: 0, rejected: 0, refusals: 0, redactions: 0, providerErrors: 0 };
  readonly audit: AuditEntry[] = [];

  constructor(opts: { provider?: LlmProvider; intents?: Iterable<string>; mode?: LlmMode } = {}) {
    this.provider = opts.provider ?? new HeuristicProvider();
    this.vocab = new IntentVocabulary(opts.intents ?? []);
    this.mode = opts.mode ?? (process.env.LLM_MODE as LlmMode) ?? 'assist';
  }

  setProvider(p: LlmProvider): void { this.provider = p; }
  setIntents(intents: Iterable<string>): void { this.vocab = new IntentVocabulary(intents); }
  setMode(mode: LlmMode): void { this.mode = mode; }

  /**
   * The seam: given the deterministic NLU core result + raw text, produce the
   * final arbitrated NLU decision (or a guardrail refusal).
   */
  async enhance(
    text: string,
    core: { intent: string; confidence: number; language: string; entities: Record<string, unknown> },
    opts: EnhanceOptions = {},
  ): Promise<EnhanceResult> {
    const t0 = Date.now();

    // 1. refusal guardrail — never send to a model
    const refusal = checkRefusal(text);
    if (refusal.refuse) {
      this.stats.refusals++;
      this.record({ channel: opts.channel ?? 'text', redactedText: text.slice(0, 120), coreIntent: core.intent, coreConfidence: core.confidence, decision: 'refused', reasons: [`refused: ${refusal.kind}`], latencyMs: Date.now() - t0 });
      return { intent: 'human_agent', confidence: 1, language: core.language, entities: {}, decision: 'refused', reasons: [`guardrail refusal (${refusal.kind})`], refusal };
    }

    // 2. should we consult at all?
    const mode = opts.mode ?? this.mode;
    const shouldConsult = mode === 'always' || (mode === 'assist' && (core.intent === 'unknown' || core.confidence < ARBITRATION_POLICY.weakCoreConfidence));
    if (mode === 'off' || !shouldConsult || this.vocab === undefined) {
      const skipped: EnhanceResult = { ...core, decision: 'skipped', reasons: [mode === 'off' ? 'LLM mode off' : `core confident (${core.confidence.toFixed(2)})`] };
      this.record({ channel: opts.channel ?? 'text', redactedText: text.slice(0, 120), coreIntent: core.intent, coreConfidence: core.confidence, decision: 'skipped', reasons: skipped.reasons, latencyMs: Date.now() - t0 });
      return skipped;
    }

    // 3. redact → 4. propose
    this.stats.consultations++;
    const { text: redactedText, redactions } = redactPii(text);
    this.stats.redactions += redactions.length;

    let proposal;
    try {
      proposal = await this.provider.propose({
        text: redactedText,
        core: { intent: core.intent, confidence: core.confidence, language: core.language },
        missingSlots: opts.missingSlots,
        channel: opts.channel,
      });
      this.stats.proposals++;
    } catch (e: any) {
      this.stats.providerErrors++;
      this.record({ channel: opts.channel ?? 'text', redactedText: redactedText.slice(0, 120), coreIntent: core.intent, coreConfidence: core.confidence, decision: 'core', reasons: [`provider error: ${e?.message ?? e}`], latencyMs: Date.now() - t0 });
      return { ...core, decision: 'core', reasons: [`provider error — falling back to core`] };
    }

    // 5. validate + arbitrate
    const decision = arbitrate(core, proposal, this.vocab);
    if (decision.adopted === 'llm' || decision.adopted === 'merged') this.stats.accepted++;
    else this.stats.rejected++;

    this.record({
      channel: opts.channel ?? 'text', redactedText: redactedText.slice(0, 120),
      coreIntent: core.intent, coreConfidence: core.confidence,
      proposalIntent: proposal.intent, proposalConfidence: proposal.confidence, provider: proposal.provider,
      decision: decision.adopted, reasons: decision.reasons, latencyMs: Date.now() - t0,
    });

    return {
      intent: decision.intent,
      confidence: decision.confidence,
      language: core.language,
      entities: decision.entities,
      decision: decision.adopted,
      reasons: decision.reasons,
    };
  }

  private record(e: Omit<AuditEntry, 'at'>): void {
    this.audit.push({ at: new Date().toISOString(), ...e });
    if (this.audit.length > AUDIT_LIMIT) this.audit.shift();
  }
}

/** Process-wide singleton used by the WhatsApp orchestrator seam. */
export const llm = new LlmOrchestrator();
