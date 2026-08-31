/**
 * Guardrails — what the customer text is allowed to reach and what the
 * assistant is never allowed to promise (docs/26 §guardrails):
 *   - PII is redacted BEFORE any provider sees the text.
 *   - Refusal paths: refund promises, price guarantees, medical/legal advice.
 */

export interface RedactionResult {
  text: string;
  redactions: Array<{ kind: string; replaced: string }>;
}

const PATTERNS: Array<[string, RegExp, string]> = [
  // phone numbers (+234..., 0803... — avoid eating short years like 2026)
  ['phone', /(\+?234|0)\d{10}\b/g, '[phone]'],
  // email
  ['email', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]'],
  // payment cards: 13–19 digits with spaces/dashes
  ['pan', /\b(?:\d[ -]?){13,19}\b/g, '[card]'],
  // Nigerian BVN / NIN — context word, optional filler ("is", "number"), 11 digits
  ['bvn', /\bbvn\b[\s:;,]*(?:is|number|no\.?|:)?[\s:;,]*\d{11}\b/gi, '[bvn]'],
  ['nin', /\bnin\b[\s:;,]*(?:is|number|no\.?|:)?[\s:;,]*\d{11}\b/gi, '[nin]'],
  // other 11-digit identifiers when flagged by context
  ['national_id', /\b(id|identity|identification|account)\b[\s:;,]*(?:is|number|no\.?|:)?[\s:;,]*\d{11}\b/gi, '[national-id]'],
];

/** Redact PII from customer text before it leaves the platform. */
export function redactPii(text: string): RedactionResult {
  let out = text;
  const redactions: Array<{ kind: string; replaced: string }> = [];
  for (const [kind, re, token] of PATTERNS) {
    out = out.replace(re, (m) => {
      redactions.push({ kind, replaced: m });
      return token;
    });
  }
  return { text: out, redactions };
}

// ── Refusal policy ──────────────────────────────────────────────────────────

export type RefusalKind = 'refund_promise' | 'price_guarantee' | 'medical' | 'legal';

export interface RefusalCheck {
  refuse: boolean;
  kind?: RefusalKind;
  match?: string;
  /** What the assistant says instead — escalation, never a promise. */
  policy: 'escalate' | 'clarify';
}

const REFUSAL_RULES: Array<[RefusalKind, RegExp, RefusalCheck['policy']]> = [
  ['refund_promise', /\b(refund|money back|reverse).{0,40}\b(guarantee|promise|definitely|sure|immediately)\b|\bpromise\b.{0,30}\brefund\b/i, 'escalate'],
  ['price_guarantee', /\b(cheapest|lowest|best) price.{0,30}\b(guarantee|promise|locked)\b|\bguarantee\b.{0,25}\b(cheaper|cheapest)\b/i, 'clarify'],
  ['medical', /\b(prescribe|medication|dosage|diagnose|medical advice)\b/i, 'escalate'],
  ['legal', /\b(legal advice|sue|court case|lawyer me)\b/i, 'escalate'],
];

/** Detect utterances the assistant must refuse to answer as an LLM. */
export function checkRefusal(text: string): RefusalCheck {
  for (const [kind, re, policy] of REFUSAL_RULES) {
    const m = text.match(re);
    if (m) return { refuse: true, kind, match: m[0], policy };
  }
  return { refuse: false, policy: 'clarify' };
}

/** The canned, guardrail-safe reply for a refused request. */
export function refusalReply(check: RefusalCheck): string {
  switch (check.kind) {
    case 'refund_promise':
      return '💳 I can\'t promise refunds here — every case is reviewed against the booking and payment record. I\'ve flagged this to a human specialist who will confirm what\'s possible. 🧑🏾‍💻';
    case 'price_guarantee':
      return 'Prices come from our live fare engine and can change with demand — I can\'t lock or guarantee a price, but I can get you a *quote right now*. Want it?';
    case 'medical':
    case 'legal':
      return '🧑🏾‍💻 That\'s outside what I can help with — I\'m connecting you to a human agent for this.';
    default:
      return '🤖 Could you rephrase that? I want to get it right.';
  }
}
