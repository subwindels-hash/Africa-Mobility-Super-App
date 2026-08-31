/**
 * LLM provider adapters — docs/26 §LLM orchestration.
 *
 * One interface, many backends. In production `OpenAiProvider` /
 * `GeminiProvider` (or a self-hosted gateway) implement `propose()` against
 * real model endpoints; the engine-side contract is identical. The default
 * `HeuristicProvider` is a fully offline second-opinion engine (different
 * vocabulary & signals than the NLU core) so the whole orchestration layer is
 * testable and demoable with zero network, zero keys, zero cost.
 */

export interface LlmProposalInput {
  /** PII-redacted customer utterance (see guardrails.ts). */
  text: string;
  /** Deterministic NLU core result — the LLM may use it as a hint. */
  core: {
    intent: string;
    confidence: number;
    language: string;
  };
  /** Slot names still missing in the active dialog draft, if any. */
  missingSlots?: string[];
  channel?: 'text' | 'voice' | 'image' | 'document';
}

export interface LlmProposal {
  intent: string;
  confidence: number;          // 0..1 self-reported
  entities: Record<string, unknown>;
  rationale?: string;
  provider: string;
  latencyMs?: number;
}

export interface LlmProvider {
  readonly name: string;
  propose(input: LlmProposalInput): Promise<LlmProposal>;
}

/** Offline second-opinion provider — different signals than the NLU core. */
export class HeuristicProvider implements LlmProvider {
  readonly name = 'heuristic-v1';

  private static readonly INTENT_HINTS: Array<[string, RegExp]> = [
    ['book_interstate', /haul|tonne|\bton\b|truck|trailer|containers?|freight|31 ?seater|goods to (kano|kaduna|abuja)/i],
    ['book_aviation', /jet|heli|chopper|charter|air ambulance|private flight/i],
    ['book_travel', /\bfly\b|flight|airport (pickup|drop)|plane|los ?→ ?abv|los-?abv/i],
    ['book_security', /escort|body ?guard|protect|convoy|secure (my|a) (home|event)/i],
    ['book_accommodation', /hotel|short ?let|room for (the )?night|airbnb|guest house/i],
    ['roadside_assist', /tow|mechanic|puncture|flat tyre|jump ?start|ran out of (fuel|petrol)/i],
    ['track_order', /where.*(ride|driver|order)|eta|how far (is|now)/i],
    ['track_shipment', /where.*(truck|goods|cargo)|delivery status|has (it|the truck) (arrived|left)/i],
    ['wallet_balance', /balance|how much (is )?(in|on) my (wallet|account)/i],
    ['wallet_fund', /top ?up|fund my|add money|load (my )?wallet/i],
    ['cancel_booking', /cancel/i],
    ['refund_support', /refund|money back|reverse (the )?payment/i],
    ['human_agent', /agent|human|person|talk to (someone|somebody)|complain/i],
    ['greeting', /^(hi|hello|hey|good (morning|afternoon|evening)|how far|kedu|bawo|sannu)\b/i],
  ];

  private static readonly ENTITY_HINTS: Array<[string, RegExp, (m: RegExpMatchArray) => unknown]> = [
    ['passengers', /\b(\d)\s*(passengers?|pax|people|adults?)\b/i, (m) => Number(m[1])],
    ['datetime', /\b(today|tomorrow|tonight|this (morning|evening|afternoon)|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}(am|pm))\b/i, (m) => ({ raw: m[0] })],
    ['serviceClass', /\b(economy|premium|luxury|vip|business|first class)\b/i, (m) => m[1].toLowerCase()],
  ];

  async propose(input: LlmProposalInput): Promise<LlmProposal> {
    const t0 = Date.now();
    const text = input.text;
    let intent = 'unknown';
    let hits = 0;
    for (const [candidate, re] of HeuristicProvider.INTENT_HINTS) {
      // priority-ordered: first (most specific) match wins — mirrors the
      // deterministic core's weight system instead of last-match overwrite
      if (re.test(text)) { intent = candidate; hits = 1; break; }
    }
    // entity extraction (passengers, datetime, serviceClass)
    const entities: Record<string, unknown> = {};
    for (const [slot, re, pick] of HeuristicProvider.ENTITY_HINTS) {
      const m = text.match(re);
      if (m) entities[slot] = pick(m);
    }
    // gazetteer-lite: "X to Y" origin/destination
    const toFrom = text.match(/from\s+([A-Za-z ]{3,24}?)\s+to\s+([A-Za-z]+(?: [A-Za-z]+)*?)(?=\s*(?:tomorrow|today|tonight|please|thanks|now|asap|as soon|before|by|,|!|\.|\?|$))/i);
    if (toFrom) {
      entities.origin = { raw: toFrom[1].trim() };
      entities.destination = { raw: toFrom[2].trim() };
    }
    const confidence = intent === 'unknown' ? 0.15 : Math.min(0.9, 0.5 + hits * 0.15 + Object.keys(entities).length * 0.1);
    return {
      intent,
      confidence,
      entities,
      rationale: `heuristic match ${hits} hint(s), ${Object.keys(entities).length} entit(ies)`,
      provider: this.name,
      latencyMs: Date.now() - t0,
    };
  }
}

/**
 * Delegating provider for production: try a list of providers in order,
 * first successful (non-refused) proposal wins. Models "per-task routing"
 * cheaply — e.g. [fastModel, smartModel].
 */
export class CascadeProvider implements LlmProvider {
  readonly name: string;
  constructor(private readonly chain: LlmProvider[]) {
    this.name = `cascade(${chain.map((p) => p.name).join(' → ')})`;
  }
  async propose(input: LlmProposalInput): Promise<LlmProposal> {
    let lastError: unknown;
    for (const p of this.chain) {
      try { return await p.propose(input); } catch (e) { lastError = e; }
    }
    throw lastError ?? new Error('cascade exhausted with no providers');
  }
}
