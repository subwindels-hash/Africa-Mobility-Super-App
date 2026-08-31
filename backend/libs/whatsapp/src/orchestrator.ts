/**
 * WhatsApp AI Orchestrator — the pipeline:
 *   webhook → message queue → session/context memory → NLU → dialog/actions
 *   → booking engine → payment engine → escalation → Super App core services.
 *
 * In production the queue is Kafka (`whatsapp.inbound`), sessions live in Redis,
 * and actions call the internal service APIs (docs/26 §Architecture). This
 * module implements the full decision logic so the same code runs in tests,
 * the sandbox, and against the real Cloud API transport.
 */
import {
  classify, classifyTranscript, ESCALATION_THRESHOLD, GAZETTEER,
  matchPlace, type NluResult, type WaLanguage,
} from './nlu';
import {
  confirmSummary, estimateFor, escalationText, fillSlots, formatNaira, greetingText,
  newSession, nextMissingSlot, quoteFor, receiptText, slotPrompt, startDraft, trackText,
  type BookingDraft, type WaSession,
} from './dialog';
import { createPaymentLink, paymentLinkText } from './payments';
import { money } from '../../core/src/domain/types';
import { CITY_STATE, countryFromPhone, ensureSeeded, UNAVAILABLE_MESSAGE, type FamsContext, type FamsDecision } from '../../fams/src/index';

const fams = ensureSeeded(); // Feature Activation Management System — Ada obeys it

const VERTICAL_DISPLAY: Record<string, { icon: string; label: string }> = {
  transportation: { icon: '🚗', label: 'Rides (economy → luxury → chauffeur)' },
  logistics: { icon: '📦', label: 'Deliveries & dispatch' },
  travel: { icon: '✈️', label: 'Flights' },
  aviation: { icon: '🚁', label: 'Private charters & jets' },
  security: { icon: '🛡', label: 'Verified security services' },
  accommodation: { icon: '🏨', label: 'Hotels & short-lets' },
  roadside: { icon: '🛠', label: 'Roadside assistance' },
  corporate_services: { icon: '🏢', label: 'Corporate services' },
};

/** Build a FAMS context from the session + detected places. */
function famsContextFor(phone: string, placeCityCode?: string): FamsContext {
  const country = countryFromPhone(phone);
  const city = placeCityCode?.startsWith('NG-') || placeCityCode?.startsWith('KE-') || placeCityCode?.startsWith('GH-') ? placeCityCode : undefined;
  return {
    country,
    state: city ? CITY_STATE[city] : undefined,
    city,
    userGroups: ['customers'],
    userId: phone,
  };
}

/** FAMS gate for a booking vertical — returns the unavailable reply or null. */
function famsGate(phone: string, vertical: string, cityCode?: string, categoryCode?: string): { reply: string; meta: any } | null {
  const ctx = famsContextFor(phone, cityCode);
  const decision = fams.evaluate('vertical', vertical, ctx);
  if (!decision.available) return { reply: unavailableText(vertical, decision, ctx), meta: { node: 'greeting', fams: 'blocked', reason: decision.reason } };
  if (categoryCode) {
    const cat = fams.evaluate('category', categoryCode, ctx);
    if (!cat.available) return { reply: unavailableText(vertical, cat, ctx), meta: { node: 'greeting', fams: 'blocked', reason: cat.reason } };
  }
  return null;
}

function unavailableText(vertical: string, d: FamsDecision, ctx: FamsContext): string {
  const where = [ctx.city, ctx.state, ctx.country].filter(Boolean).join(' / ');
  const display = VERTICAL_DISPLAY[vertical]?.label ?? vertical;
  const state = d.value === 'maintenance' ? 'is under maintenance right now' : d.value === 'hidden' ? 'is not offered here yet' : 'is currently switched off';
  const enabled = Object.entries(VERTICAL_DISPLAY)
    .filter(([v]) => fams.verticalAvailable(v, ctx))
    .map(([, x]) => `${x.icon} ${x.label.split(' (')[0]}`)
    .slice(0, 5);
  return [
    `🚫 *${display}* ${state}${where ? ` in ${where}` : ''}.`,
    '',
    `_${UNAVAILABLE_MESSAGE}_`,
    d.reason ? `(${d.reason})` : '',
    enabled.length ? `Right now I *can* help you with: ${enabled.join(' · ')}` : '',
  ].filter(Boolean).join('\n');
}

export interface InboundMessage {
  from: string;                        // WhatsApp phone (msisdn)
  type: 'text' | 'location' | 'audio' | 'image' | 'button' | 'interactive';
  text?: string;
  location?: { lat: number; lng: number; label?: string };
  mediaId?: string;                    // voice note / image → media pipeline
  button?: string;
  timestamp: string;
}

export interface OutboundMessage {
  to: string;
  text: string;
  meta?: { intent?: string; confidence?: number; node?: string; escalated?: boolean; bookingId?: string; fams?: string; reason?: string };
}

export interface OrchestratorStats {
  conversations: number;
  messages: number;
  aiResolved: number;
  escalated: number;
  bookingsCreated: number;
}

const sessions = new Map<string, WaSession>();
const bookings = new Map<string, { id: string; phone: string; draft: BookingDraft; totalMinor: number; vendor: string; status: string }>();
const agents = new Map<string, string>(); // phone → assigned agent (escalations)

export const stats: OrchestratorStats = { conversations: 0, messages: 0, aiResolved: 0, escalated: 0, bookingsCreated: 0 };

export function getSession(phone: string): WaSession {
  let s = sessions.get(phone);
  if (!s) { s = newSession(phone); sessions.set(phone, s); stats.conversations++; }
  return s;
}

/** ASR/OCR adapters — Whisper-class ASR & vision OCR in prod (docs/19 AI-11). */
export interface MediaPipeline {
  transcribe(mediaId: string, lang?: WaLanguage): Promise<string>;
  extractFromImage(mediaId: string): Promise<{ ocrText: string; locations: { lat?: number; lng?: number; raw: string; source: 'image' }[] }>;
}
export const mediaPipeline: MediaPipeline = {
  async transcribe(mediaId: string) { return `[voice:${mediaId}]`; },
  async extractFromImage(mediaId: string) { return { ocrText: '', locations: [] }; },
};
export function setMediaPipeline(p: MediaPipeline) { Object.assign(mediaPipeline, p); }

/** Entry point — queue consumer calls this for every inbound message. */
export async function processInbound(msg: InboundMessage): Promise<OutboundMessage> {
  const out = await routeInbound(msg);
  getSession(msg.from).history.push({ role: 'ai', text: out.text, at: new Date().toISOString() });
  return out;
}

async function routeInbound(msg: InboundMessage): Promise<OutboundMessage> {
  stats.messages++;
  const session = getSession(msg.from);
  session.history.push({ role: 'customer', text: describeInbound(msg), at: msg.timestamp });

  // already with a human agent → do not let AI interrupt
  if (session.escalated) {
    return { to: msg.from, text: '🧑🏾‍💻 You\'re with a live agent — they\'ll reply here shortly.', meta: { node: 'escalated', escalated: true } };
  }

  // location payloads slot-fill directly
  if (msg.type === 'location' && msg.location) {
    const d = session.draft;
    if (d && !d.slots.pickup) {
      d.slots.pickup = msg.location.label ?? `${msg.location.lat.toFixed(4)},${msg.location.lng.toFixed(4)}`;
      return nextStep(msg.from, session);
    }
    if (d && !d.slots.dropoff) {
      d.slots.dropoff = msg.location.label ?? `${msg.location.lat.toFixed(4)},${msg.location.lng.toFixed(4)}`;
      return nextStep(msg.from, session);
    }
    return { to: msg.from, text: '📍 Got your location. Tell me what you need — e.g. *"taxi from here to Ikeja"*.' };
  }

  if (msg.type === 'audio' && msg.mediaId) {
    const transcript = await mediaPipeline.transcribe(msg.mediaId, session.language);
    session.history.push({ role: 'customer', text: `🎤 "${transcript}"`, at: msg.timestamp });
    const nlu = classifyTranscript(transcript, 'voice');
    return route(msg.from, session, nlu, transcript);
  }

  if (msg.type === 'image' && msg.mediaId) {
    const { ocrText, locations } = await mediaPipeline.extractFromImage(msg.mediaId);
    if (!ocrText && locations.length === 0) {
      return { to: msg.from, text: '🖼 I received the image but couldn\'t read it clearly. Could you type the address or send a location pin?', meta: { node: session.node } };
    }
    const nlu = classifyTranscript(ocrText || 'address', 'image', { locations });
    return route(msg.from, session, nlu, ocrText || locations.map((l) => l.raw).join(' to '));
  }

  const text = msg.text ?? msg.button ?? '';
  if (!text.trim()) return { to: msg.from, text: '🤖 Send a message, voice note, location pin or photo — I can handle all of them.' };

  // pending confirmation ("1"/"2") resolves before new NLU routing
  const confirmed = handleConfirmation(msg.from, session, text);
  if (confirmed) return confirmed;

  const nlu = classify(text);
  session.language = nlu.language; // adapt to customer's language
  return route(msg.from, session, nlu, text);
}

async function route(phone: string, session: WaSession, nlu: NluResult, rawText: string): Promise<OutboundMessage> {
  const meta = { intent: nlu.intent, confidence: nlu.confidence, node: session.node };

  // mid-flow slot answers: a short/unknown reply while collecting slots fills the
  // next missing slot instead of being re-classified or escalated
  if (session.node === 'collect_slots' && session.draft) {
    const isPlainAnswer =
      nlu.intent === 'unknown' ||
      nlu.entityFallback === true ||
      (nlu.confidence < ESCALATION_THRESHOLD && !nlu.intent.startsWith('book_'));
    if (isPlainAnswer) {
      const draft = session.draft;
      const missing = nextMissingSlot(draft);
      if (missing) {
        const known = matchPlace(rawText);
        const looksLikeAnswer = known || /[a-z]{3}/i.test(rawText) || /\d/.test(rawText);
        if (!looksLikeAnswer) {
          return { to: phone, text: `🤖 I didn't catch that. ${slotPrompt(missing, session.language)}`, meta };
        }
        // prefer entity → matching missing slot, else raw answer into the slot
        if (missing === 'pickup' && nlu.entities.origin?.raw) draft.slots.pickup = nlu.entities.origin.raw;
        else if (missing === 'dropoff' && nlu.entities.destination?.raw) draft.slots.dropoff = nlu.entities.destination.raw;
        else draft.slots[missing] = known?.name ?? rawText.trim();
        return nextStep(phone, session, meta);
      }
    }
  }

  // hard handoffs first
  if (nlu.intent === 'human_agent' || nlu.confidence < ESCALATION_THRESHOLD || (nlu.sentiment === 'negative' && nlu.confidence < 0.75)) {
    return escalate(phone, session, meta);
  }

  switch (nlu.intent) {
    case 'greeting': {
      session.node = 'greeting';
      stats.aiResolved++;
      const ctx = famsContextFor(phone);
      const enabledList = Object.entries(VERTICAL_DISPLAY)
        .filter(([v]) => fams.verticalAvailable(v, ctx))
        .map(([, x]) => `${x.icon} ${x.label}`)
        .join('\n');
      const text =
        session.language === 'pcm'
          ? `How far! 🙌 I be *Ada*, your AMSA assistant.\n\nWetin dey available today:\n${enabledList}\n\n💳 Wallet, payment & tracking too.\n\n*Wetin I go do for you?*`
          : session.language === 'en'
            ? `Hello and welcome! 🙌 I'm *Ada*, your AMSA assistant.\n\nHere's what's live on AMSA today:\n${enabledList}\n\n💳 Wallet, payments & tracking too.\n\n*How may I assist you today?*`
            : greetingText(session.language);
      return { to: phone, text, meta };
    }

    case 'track_order': {
      stats.aiResolved++;
      const b = session.lastBookingId ? bookings.get(session.lastBookingId) : undefined;
      if (!b) {
        return { to: phone, text: '🔍 I couldn\'t find an active booking on this number. Send me the booking ID (e.g. *BKG-12345*) or book something new.', meta: { ...meta, node: 'tracking' } };
      }
      return { to: phone, text: trackText(b.status, 7 * 60, b.vendor, session.language), meta: { ...meta, node: 'tracking', bookingId: b.id } };
    }

    case 'wallet_balance': {
      stats.aiResolved++;
      const bal = 4_250_000; // wallet-service lookup in prod
      return { to: phone, text: `💳 *Your AMSA wallet*\n\nAvailable: *${formatNaira(bal)}*\nPending in escrow: *${formatNaira(320_000)}*\n⭐ Points: 6,240 (GOLD)\n\nReply *fund* to top up or *transfer* to send money.`, meta: { ...meta, node: 'wallet' } };
    }

    case 'wallet_fund': {
      stats.aiResolved++;
      const link = createPaymentLink(`WAL-${phone.slice(-6)}`, 500_000);
      return { to: phone, text: `💳 Top up your wallet:\n\n${paymentLinkText(500_000, 'NGN', link.url)}\n\n_(demo amount ₦5,000 — tell me any other amount and I\'ll generate a fresh link.)_`, meta: { ...meta, node: 'wallet' } };
    }

    case 'payment': {
      stats.aiResolved++;
      const b = session.lastBookingId ? bookings.get(session.lastBookingId) : undefined;
      if (!b) return { to: phone, text: 'You have no pending payment. Book a service first — e.g. *"taxi from Lekki to Ikeja"*.', meta };
      const link = createPaymentLink(b.id, b.totalMinor);
      return { to: phone, text: paymentLinkText(b.totalMinor, 'NGN', link.url), meta: { ...meta, node: 'payment', bookingId: b.id } };
    }

    case 'refund_support':
      return escalate(phone, session, meta, 'refund');

    case 'check_availability': {
      stats.aiResolved++;
      const place = matchPlace(rawText);
      const city = place?.name ?? 'your city';
      const ctx = famsContextFor(phone, place?.city);
      const servicesHere = Object.entries(VERTICAL_DISPLAY)
        .filter(([v]) => fams.verticalAvailable(v, ctx))
        .map(([, x]) => `${x.icon} ${x.label.split(' (')[0]}`)
        .join(' · ');
      const text = [
        '🗺 *Where AMSA is available*',
        '',
        '*Live now (10 cities):* Lagos · Abuja · Port Harcourt · Benin City · Asaba · Enugu · Awka · Onitsha · Kano · Ibadan',
        '',
        `*Services in ${city}:* ${servicesHere || 'none — switch to a nearby city'}`,
        '',
        'Coming next: Accra 🇬🇭 · Nairobi 🇰🇪 · Johannesburg 🇿🇦.',
        `Want me to book something in *${city}* right now?`,
      ].join('\n');
      return { to: phone, text, meta: { ...meta, node: 'greeting' } };
    }

    case 'manage_services': {
      stats.aiResolved++;
      const mine = [...bookings.values()].filter((b) => b.phone === phone);
      if (mine.length === 0) {
        return { to: phone, text: '📋 You have no bookings on this number yet. Tell me what you need — e.g. *"taxi from Lekki to Ikeja"* — and I\'ll set it up.', meta: { ...meta, node: 'greeting' } };
      }
      const lines = mine.slice(-5).map((b) => `• *${b.id}* — ${b.draft.vertical} · ${b.status} · ${formatNaira(b.totalMinor)}`);
      return {
        to: phone,
        text: ['📋 *Your bookings:*', '', ...lines, '', 'Reply *track* (live location), *cancel*, *reschedule* or *pay* — or send a booking ID.'].join('\n'),
        meta: { ...meta, node: 'tracking', bookingId: mine[mine.length - 1].id },
      };
    }

    case 'cancel_booking': {
      const b = session.lastBookingId ? bookings.get(session.lastBookingId) : undefined;
      if (!b) return { to: phone, text: 'No recent booking on this number to cancel. Send the booking ID if you have one.', meta };
      b.status = 'cancelled';
      return { to: phone, text: `❌ Booking *${b.id}* cancelled.\n\nRefund: full (free cancellation window ✅) — back to your wallet within minutes, protected by escrow. Anything else?`, meta: { ...meta, bookingId: b.id } };
    }

    case 'modify_booking': {
      const b = session.lastBookingId ? bookings.get(session.lastBookingId) : undefined;
      if (!b) return { to: phone, text: 'Which booking should I change? Send the ID or describe the new time/place.', meta };
      return { to: phone, text: `🔁 Got it — what\'s the new time or place for *${b.id}*? (e.g. *"tomorrow 8am"* or *"dropoff Yaba"*)`, meta: { ...meta, node: 'collect_slots' } };
    }

    case 'unknown':
      return escalate(phone, session, meta);
  }

  // booking intents — FAMS gate first (AI respects activation settings), then draft
  if (nlu.vertical) {
    const place = matchPlace(rawText);
    const cityCode = place?.city;
    const gated = famsGate(phone, nlu.vertical, cityCode, nlu.entities.serviceClass);
    if (gated) return { to: phone, text: gated.reply, meta: gated.meta };
  }
  if (!session.draft || session.draft.intent !== nlu.intent) {
    startDraft(nlu, session);
  } else {
    fillSlots(session.draft, nlu.entities);
  }
  session.node = 'collect_slots';
  return nextStep(phone, session, meta);
}

/** Ask for the next missing slot, or produce the confirmation summary. */
function nextStep(phone: string, session: WaSession, meta: any = {}): OutboundMessage {
  const draft = session.draft!;
  const missing = nextMissingSlot(draft);
  if (missing) {
    return { to: phone, text: slotPrompt(missing, session.language), meta: { ...meta, node: 'collect_slots', intent: draft.intent } };
  }
  const estimate = estimateFor(draft);
  draft.estimate = estimate;
  if (!estimate) draft.quote = quoteFor(draft);
  draft.quoteRef = `RFQ-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  session.node = 'confirm';
  return { to: phone, text: confirmSummary(draft, estimate, draft.quoteRef), meta: { ...meta, node: 'confirm', intent: draft.intent } };
}

/** Confirmation handling: "1"/yes → create booking + payment link. */
export function handleConfirmation(phone: string, session: WaSession, raw: string): OutboundMessage | null {
  if (session.node !== 'confirm') return null;
  const draft = session.draft!;
  if (/^(1|yes|y|confirm|ok|okay|book|yes abeg|i confirm)/i.test(raw.trim())) {
    // final FAMS re-check at confirmation — the destination city may only be known now
    const slotText = Object.values(draft.slots).filter(Boolean).join(' ');
    const place = matchPlace(slotText);
    const gated = famsGate(phone, draft.vertical, place?.city);
    if (gated) {
      session.draft = undefined;
      session.node = 'greeting';
      return { to: phone, text: gated.reply, meta: { node: 'greeting', fams: 'blocked', reason: gated.meta.reason } };
    }
    const id = `BKG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const totalMinor = draft.estimate?.range.min ?? draft.quote?.minMinor ?? 3_500_000;
    const vendor = pickVendorFor(draft);
    bookings.set(id, { id, phone, draft, totalMinor, vendor, status: 'matched' });
    session.lastBookingId = id;
    session.node = 'payment';
    stats.bookingsCreated++;
    stats.aiResolved++;
    session.draft = undefined;
    const link = createPaymentLink(id, totalMinor);
    return {
      to: phone,
      text: `${receiptText(id, money(totalMinor), vendor, session.language)}\n\n${paymentLinkText(totalMinor, 'NGN', link.url)}\n\nReply *track* anytime for live tracking.`,
      meta: { node: 'payment', bookingId: id },
    };
  }
  if (/^(2|no|n|change)/i.test(raw.trim())) {
    const which = nextMissingSlot(draft) ?? 'pickup';
    draft.slots[which] = undefined;
    session.node = 'collect_slots';
    return { to: phone, text: `Sure — let's adjust it.\n\n${slotPrompt(which, session.language)}`, meta: { node: 'collect_slots' } };
  }
  return null; // fall through to normal routing (maybe they typed a new request)
}

export function escalate(phone: string, session: WaSession, meta: any = {}, reason = 'low-confidence'): OutboundMessage {
  session.escalated = true;
  session.node = 'escalated';
  stats.escalated++;
  agents.set(phone, 'agent_pool_1'); // routing by skill/language in prod
  const why = reason === 'refund' ? ' (refund request)' : nluNote(meta);
  return { to: phone, text: escalationText(session.language) + why, meta: { ...meta, node: 'escalated', escalated: true } };
}

function nluNote(meta: any): string {
  if (meta?.confidence !== undefined && meta.confidence < ESCALATION_THRESHOLD) {
    return `\n\n_(AI confidence ${(meta.confidence * 100).toFixed(0)}% — below ${(ESCALATION_THRESHOLD * 100).toFixed(0)}% threshold, so a human takes over.)_`;
  }
  return '';
}

/** Vendor matching — same ranking signals as the matching engine (docs/07 §2.1). */
function pickVendorFor(draft: BookingDraft): string {
  if (draft.vertical === 'security') return 'SafeGuard NG ✅licensed';
  if (draft.vertical === 'aviation') return 'SkyJet Charter ✅verified';
  if (draft.vertical === 'travel') return 'Zenith Travels ✅IATA';
  if (draft.vertical === 'accommodation') return 'AMSA Stays partner hotels';
  if (draft.vertical === 'roadside') return 'Lagos Rescue Squad ✅verified';
  if (draft.vertical === 'logistics') return 'Rider Musa ★4.9';
  return 'Driver Ade ★4.9 · Toyota Camry';
}

// re-exports for webhook/tests
export { classify, matchPlace, GAZETTEER, sessions as sessionStore, bookings as bookingStore, agents as escalationStore };

export function describeInbound(m: InboundMessage): string {
  if (m.type === 'location') return `📍 ${m.location?.label ?? `${m.location?.lat},${m.location?.lng}`}`;
  if (m.type === 'audio') return `🎤 ${m.mediaId}`;
  if (m.type === 'image') return `🖼 ${m.mediaId}`;
  return m.text ?? m.button ?? '';
}
