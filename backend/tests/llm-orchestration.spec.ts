/**
 * LLM Orchestration Layer (docs/26 — "LLM proposes, engines validate").
 * Covers: PII guardrails, refusal paths, arbitration policy, provider
 * fallback, audit trail, and the live WhatsApp seam wiring.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  LlmOrchestrator, HeuristicProvider, redactPii, checkRefusal, refusalReply,
  arbitrate, validateEntity, IntentVocabulary, ARBITRATION_POLICY,
  type LlmProvider, type LlmProposal, type LlmProposalInput,
} from '../libs/llm/src/index';
import { WA_INTENTS } from '../libs/whatsapp/src/nlu';
import * as wa from '../libs/whatsapp/src/index';

const VOCAB = new IntentVocabulary(WA_INTENTS);

// ── PII guardrails ──────────────────────────────────────────────────────────

describe('guardrails — PII redaction', () => {
  it('redacts phone numbers', () => {
    const r = redactPii('call me on 08031234567 or +2348012345678');
    expect(r.text).not.toContain('08031234567');
    expect(r.text).not.toContain('+2348012345678');
    expect(r.text).toContain('[phone]');
    expect(r.redactions.filter((x) => x.kind === 'phone')).toHaveLength(2);
  });

  it('redacts emails and card numbers', () => {
    const r = redactPii('my mail is ada@example.com, card 4111 1111 1111 1111');
    expect(r.text).toContain('[email]');
    expect(r.text).toContain('[card]');
    expect(r.text).not.toContain('ada@example.com');
    expect(r.text).not.toContain('4111');
  });

  it('redacts BVN/NIN with context', () => {
    const r = redactPii('my BVN is 22212345678 and NIN: 32112345678');
    expect(r.text).not.toContain('22212345678');
    expect(r.text).not.toContain('32112345678');
  });

  it('keeps ordinary text untouched', () => {
    const r = redactPii('I need a ride from Ikeja to Victoria Island tomorrow');
    expect(r.text).toBe('I need a ride from Ikeja to Victoria Island tomorrow');
    expect(r.redactions).toHaveLength(0);
  });
});

// ── Refusal paths ───────────────────────────────────────────────────────────

describe('guardrails — refusal policy', () => {
  it('refuses refund promises with escalation policy', () => {
    const c = checkRefusal('will you guarantee a refund immediately if the driver is late?');
    expect(c.refuse).toBe(true);
    expect(c.kind).toBe('refund_promise');
    expect(c.policy).toBe('escalate');
    expect(refusalReply(c)).not.toMatch(/guarantee/i);
  });

  it('refuses price guarantees with clarify policy', () => {
    const c = checkRefusal('promise me the cheapest price is locked');
    expect(c.refuse).toBe(true);
    expect(c.kind).toBe('price_guarantee');
    expect(c.policy).toBe('clarify');
  });

  it('refuses medical and legal advice requests', () => {
    expect(checkRefusal('what medication should I take for fever?').kind).toBe('medical');
    expect(checkRefusal('I need legal advice about the accident').kind).toBe('legal');
  });

  it('does not refuse ordinary refund *requests* (support handles those)', () => {
    expect(checkRefusal('I want a refund for my last trip').refuse).toBe(false);
  });
});

// ── Arbitration: LLM proposes, engines validate ─────────────────────────────

describe('arbitration — engines validate', () => {
  const core = { intent: 'book_transport', confidence: 0.9, language: 'en', entities: {} };

  it('strong core keeps its intent; valid LLM entities merge', () => {
    const d = arbitrate(core, { intent: 'book_transport', confidence: 0.8, entities: { passengers: 2 } }, VOCAB);
    expect(d.adopted).toBe('merged');
    expect(d.intent).toBe('book_transport');
    expect(d.entities.passengers).toBe(2);
  });

  it('strong core overrides a confident but disagreeing LLM', () => {
    const d = arbitrate(core, { intent: 'book_aviation', confidence: 0.95, entities: {} }, VOCAB);
    expect(d.intent).toBe('book_transport');
    expect(['core', 'merged']).toContain(d.adopted);
  });

  it('weak core adopts a confident, valid LLM proposal', () => {
    const d = arbitrate(
      { intent: 'unknown', confidence: 0.2, language: 'en', entities: {} },
      { intent: 'book_interstate', confidence: 0.8, entities: { cargoType: 'pipes' } },
      VOCAB,
    );
    expect(d.adopted).toBe('llm');
    expect(d.intent).toBe('book_interstate');
  });

  it('rejects proposals with intents outside the engine vocabulary', () => {
    const d = arbitrate(core, { intent: 'order_pizza', confidence: 0.99, entities: {} }, VOCAB);
    expect(d.adopted).toBe('core');
    expect(d.reasons[0]).toMatch(/not in vocabulary/);
  });

  it('rejects low-confidence proposals outright', () => {
    const d = arbitrate(
      { intent: 'unknown', confidence: 0.2, language: 'en', entities: {} },
      { intent: 'book_transport', confidence: ARBITRATION_POLICY.minLlmConfidence - 0.01, entities: {} },
      VOCAB,
    );
    expect(d.adopted).toBe('core');
  });

  it('entity schema is closed: unknown slots and bad values are dropped', () => {
    const d = arbitrate(
      { intent: 'unknown', confidence: 0.1, language: 'en', entities: {} },
      { intent: 'book_transport', confidence: 0.8, entities: { bankPin: '1234', passengers: 50, serviceClass: 'ROYAL' } },
      VOCAB,
    );
    expect(d.adopted).toBe('llm');
    expect(d.entities.bankPin).toBeUndefined();
    expect(d.entities.passengers).toBeUndefined();
    expect(d.entities.serviceClass).toBeUndefined();
    expect(d.reasons.join(' ')).toMatch(/bankPin/);
  });

  it('validateEntity: passengers 1-9, known service classes, location shapes', () => {
    expect(validateEntity('passengers', 3).ok).toBe(true);
    expect(validateEntity('passengers', 0).ok).toBe(false);
    expect(validateEntity('serviceClass', 'VIP').value).toBe('vip');
    expect(validateEntity('destination', { raw: 'Kano' }).ok).toBe(true);
    expect(validateEntity('destination', 'Kano').ok).toBe(false);
  });
});

// ── Orchestrator: consult policy, fallback, audit ───────────────────────────

describe('LlmOrchestrator — consult policy & audit', () => {
  it('assist mode skips the LLM when the core is confident', async () => {
    const o = new LlmOrchestrator({ intents: WA_INTENTS, mode: 'assist' });
    const r = await o.enhance('book a taxi from Ikeja to VI', { intent: 'book_transport', confidence: 0.92, language: 'en', entities: {} });
    expect(r.decision).toBe('skipped');
    expect(o.stats.consultations).toBe(0);
  });

  it('consults on unknown/low-confidence core and adopts good proposals', async () => {
    const o = new LlmOrchestrator({ intents: WA_INTENTS, mode: 'assist' });
    const r = await o.enhance('I have 15 tonnes of pipes to move to Kano', { intent: 'unknown', confidence: 0.15, language: 'en', entities: {} });
    expect(['llm', 'merged', 'core']).toContain(r.decision);
    if (r.decision === 'llm') expect(r.intent).toBe('book_interstate');
    expect(o.stats.consultations).toBe(1);
  });

  it('falls back to the deterministic core on provider error', async () => {
    class Exploding implements LlmProvider {
      readonly name = 'explode';
      async propose(): Promise<LlmProposal> { throw new Error('rate limited'); }
    }
    const o = new LlmOrchestrator({ provider: new Exploding(), intents: WA_INTENTS, mode: 'always' });
    const r = await o.enhance('anything', { intent: 'book_transport', confidence: 0.3, language: 'en', entities: {} });
    expect(r.decision).toBe('core');
    expect(r.intent).toBe('book_transport');
    expect(o.stats.providerErrors).toBe(1);
  });

  it('guardrail refusal short-circuits before any provider call', async () => {
    let called = false;
    class Spy implements LlmProvider {
      readonly name = 'spy';
      async propose(input: LlmProposalInput): Promise<LlmProposal> { called = true; return { intent: 'greeting', confidence: 1, entities: {}, provider: 'spy' }; }
    }
    const o = new LlmOrchestrator({ provider: new Spy(), intents: WA_INTENTS, mode: 'always' });
    const r = await o.enhance('guarantee me a refund definitely', { intent: 'refund_support', confidence: 0.4, language: 'en', entities: {} });
    expect(r.decision).toBe('refused');
    expect(called).toBe(false);           // the model never saw it
    expect(r.intent).toBe('human_agent'); // routed to humans instead
  });

  it('records an audit trail with redacted text and counts redactions', async () => {
    const o = new LlmOrchestrator({ intents: WA_INTENTS, mode: 'always' });
    await o.enhance('move my goods, call 08031234567', { intent: 'unknown', confidence: 0.2, language: 'en', entities: {} });
    const entry = o.audit.at(-1)!;
    expect(entry.redactedText).not.toContain('08031234567');
    expect(entry.redactedText).toContain('[phone]');
    expect(o.stats.redactions).toBeGreaterThanOrEqual(1);
    expect(entry.decision).toBeDefined();
  });
});

// ── Live seam: WhatsApp orchestrator runs through the LLM layer ─────────────

describe('WhatsApp seam — LLM orchestration wired in', () => {
  beforeEach(() => {
    wa.sessionStore.clear();
    wa.bookingStore.clear();
  });

  it('guardrail refusal escalates the session and never promises', async () => {
    const out = await wa.processInbound({ from: '+2348000000001', type: 'text', text: 'will you definitely guarantee my refund immediately?', timestamp: new Date().toISOString() });
    expect(out.text).toMatch(/can't promise|human specialist/i);
    expect(wa.getSession('+2348000000001').escalated).toBe(true);
  });

  it('ordinary booking flow still works end-to-end with the layer in place', async () => {
    const out = await wa.processInbound({ from: '+2348000000002', type: 'text', text: 'I need a taxi from Ikeja to Victoria Island', timestamp: new Date().toISOString() });
    expect(out.text).toBeTruthy();
    expect(out.meta?.node).toBeDefined();
  });

  it('voice-channel utterances also pass through the seam', async () => {
    wa.setMediaPipeline({ ...wa.mediaPipeline, transcribe: async () => 'I need to move 15 tonnes of tiles from Lagos to Kano' });
    const out = await wa.processInbound({ from: '+2348000000003', type: 'audio', mediaId: 'm1', timestamp: new Date().toISOString() });
    expect(out.text).toBeTruthy();
  });
});

// ── Offline provider sanity ─────────────────────────────────────────────────

describe('HeuristicProvider (offline default)', () => {
  it('proposes interstate for freight language and extracts entities', async () => {
    const p = new HeuristicProvider();
    const prop = await p.propose({ text: 'haul 15 tonnes of pipes from Lagos to Kano tomorrow, 3 passengers escort', core: { intent: 'unknown', confidence: 0.1, language: 'en' } });
    expect(prop.intent).toBe('book_interstate');
    expect(prop.confidence).toBeGreaterThan(0.5);
    expect(prop.entities.destination).toEqual({ raw: 'Kano' });
  });
});
