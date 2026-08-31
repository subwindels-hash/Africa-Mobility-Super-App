/**
 * AMSA WhatsApp NLU Engine — intent detection, entity extraction,
 * language detection (EN/Hausa/Yoruba/Igbo/Pidgin), sentiment, confidence.
 *
 * Deterministic rule+gazetteer core (fast, testable, offline) with the LLM
 * orchestration layer documented in docs/26 — in production the LLM proposes,
 * this engine validates & guardsrails (same pattern as the fare engine).
 */

export type WaLanguage = 'en' | 'pcm' | 'ha' | 'yo' | 'ig';

export type WaIntent =
  | 'greeting'
  | 'book_transport' | 'book_logistics' | 'book_travel' | 'book_aviation'
  | 'book_security' | 'book_accommodation' | 'roadside_assist'
  | 'track_order' | 'wallet_balance' | 'wallet_fund' | 'payment'
  | 'modify_booking' | 'cancel_booking' | 'refund_support'
  | 'check_availability' | 'manage_services'
  | 'human_agent' | 'unknown';

export const INTENT_VERTICAL: Partial<Record<WaIntent, string>> = {
  book_transport: 'transportation', book_logistics: 'logistics', book_travel: 'travel',
  book_aviation: 'aviation', book_security: 'security',
  book_accommodation: 'accommodation', roadside_assist: 'roadside',
};

// ────────────────────────────── Language detection ─────────────────────────

const LANG_MARKERS: Record<Exclude<WaLanguage, 'en'>, string[]> = {
  pcm: ['abeg', 'i wan', 'mek', 'how far', 'wetin', 'no wahala', 'sharp sharp', 'comot', 'carry me', 'enter', 'na so', 'i go', 'you dey', 'i dey', 'wahala', 'ose', 'make una', 'shey', 'e don', 'ginger', 'hook me'],
  ha: ['sannu', 'nawa', 'ina kwana', 'lafiya', 'na gode', 'motoci', 'kudi', 'madalla', 'zuwa', 'ina son', 'tasi', 'filin jirgi', 'don Allah', 'yaya kake'],
  yo: ['bawo', 'mo fe', 'jọwọ', 'jowo', 'e ṣe', 'e se', 'nibo', 'ọkọ', 'oko oju irin', 'wa', 'kilode', 'o dabo', 'ẹ káàárọ', 'kaaro'],
  ig: ['kedu', 'biko', 'daalụ', 'daalu', 'ụgbọ', 'ugbo', 'echere', 'm na', 'ọ dị', 'odi mma', 'ekee', 'ọnụ', 'onye'],
};

export function detectLanguage(text: string): WaLanguage {
  const t = ` ${text.toLowerCase()} `;
  let best: WaLanguage = 'en';
  let bestScore = 0;
  for (const [lang, markers] of Object.entries(LANG_MARKERS) as [Exclude<WaLanguage, 'en'>, string[]][]) {
    const score = markers.reduce((n, m) => (t.includes(m) ? n + 1 : n), 0);
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  return bestScore === 0 ? 'en' : best;
}

// ────────────────────────────── Intent patterns ────────────────────────────

interface IntentRule { intent: WaIntent; patterns: RegExp[]; weight?: number }

const RULES: IntentRule[] = [
  { intent: 'greeting', patterns: [/^(hi|hello|hey|good\s?(morning|afternoon|evening))\b/i, /^(how far|kedu|bawo|sannu|good day)\b/i, /^sup\b|whats up|what's up/i], weight: 1 },
  { intent: 'book_aviation', patterns: [/private jet|heli(copter)?|chopper|air ambulance|jet charter|charter (a )?(flight|plane)/i], weight: 3 },
  { intent: 'book_travel', patterns: [/flight|fly to|plane ticket|book.*ticket|airline|travel to.*(flight|abuja|lagos|kano)/i], weight: 2 },
  { intent: 'book_security', patterns: [/security|escort|body ?guard|executive protection|convoy|protection service|vip escort|secure/i], weight: 3 },
  { intent: 'book_accommodation', patterns: [/hotel|apartment|short ?let|shortlet|lodge|accommodation|book.*(room|stay)|airbnb/i], weight: 3 },
  { intent: 'roadside_assist', patterns: [/tow(ing)?|breakdown|mechanic|jump ?start|battery|fuel (delivery|assist)|ran out of (fuel|petrol)|tyre|tire|puncture|car (won'?t|wont) start|vehicle recovery|engine (problem|issue)/i], weight: 3 },
  { intent: 'book_logistics', patterns: [/dispatch|deliver|delivery|parcel|package|courier|send.*(document|item|goods|package)|drop off|pick ?up.*(package|parcel)|shipment|waybill/i], weight: 2 },
  { intent: 'book_transport', patterns: [/taxi|cab\b|\bride\b|drop me|carry me|take me|airport (pick ?up|transfer|pickup)|hotel transfer|chauffeur|intercity|vip (transport|car)|uber|bolt|car to/i], weight: 2 },
  { intent: 'track_order', patterns: [/where.*(rider|driver|package|parcel|booking|order|my (taxi|cab|driver))|track(ing)?\b|eta\b|how far.*(driver|rider|order)/i], weight: 3 },
  { intent: 'wallet_balance', patterns: [/balance|how much.*(wallet|account)|wallet info|my wallet/i], weight: 2 },
  { intent: 'wallet_fund', patterns: [/fund (my )?wallet|top ?up|add money|load (my )?wallet|credit (my )?wallet/i], weight: 3 },
  { intent: 'payment', patterns: [/pay(ment)? link|how (do|can) i pay|make payment|send account|pay now/i], weight: 2 },
  { intent: 'refund_support', patterns: [/refund|my money back|complain|issue|problem|not happy|scam|wrong (charge|fare)|report/i], weight: 2 },
  { intent: 'cancel_booking', patterns: [/cancel/i], weight: 2 },
  { intent: 'modify_booking', patterns: [/(re)?schedule|change.*(time|booking|destination|address)|reschedule|move my (booking|ride)/i], weight: 2 },
  { intent: 'check_availability', patterns: [/(is|are) .*(available|operational|running)|availability|do you (offer|have|provide|do|cover)|what services|which cities|areas? (do|you) cover/i], weight: 3 },
  { intent: 'manage_services', patterns: [/manage my|my (bookings|services|orders|account|subscriptions?)|view my (bookings|orders)|booking history|my trips/i], weight: 3 },
  { intent: 'human_agent', patterns: [/agent|human|real person|customer care|talk to.*(person|someone|human)|operator|live person/i], weight: 3 },
];

export interface NluEntityLocation { raw: string; lat?: number; lng?: number; source: 'text' | 'pin' | 'gps' | 'image' | 'voice' }
export interface NluEntities {
  origin?: NluEntityLocation;
  destination?: NluEntityLocation;
  datetime?: { raw: string; iso?: string };
  serviceClass?: string;
  passengers?: number;
  item?: string;
  assistType?: string;
  nights?: number;
}

export interface NluResult {
  intent: WaIntent;
  vertical?: string;
  language: WaLanguage;
  entities: NluEntities;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  /** true when intent was inferred only from detected places (no keyword evidence) */
  entityFallback?: boolean;
}

// ─────────────────────── Nigerian places gazetteer (seed) ──────────────────

export interface GazetteerPlace { name: string; aliases: string[]; lat: number; lng: number; city: string }

export const GAZETTEER: GazetteerPlace[] = [
  { name: 'Lagos', aliases: ['lagos', 'lagos island', 'ebute metta'], lat: 6.5244, lng: 3.3792, city: 'NG-LAG' },
  { name: 'Lekki', aliases: ['lekki phase 1', 'lekki-i'], lat: 6.4413, lng: 3.4712, city: 'NG-LAG' },
  { name: 'Victoria Island', aliases: ['vi', 'v.i', 'victoria island'], lat: 6.4281, lng: 3.4219, city: 'NG-LAG' },
  { name: 'Ikeja', aliases: ['ikeja city mall', 'ikeja'], lat: 6.6018, lng: 3.3515, city: 'NG-LAG' },
  { name: 'Yaba', aliases: ['yaba'], lat: 6.5095, lng: 3.3711, city: 'NG-LAG' },
  { name: 'Surulere', aliases: ['surulere'], lat: 6.5000, lng: 3.3500, city: 'NG-LAG' },
  { name: 'Ikoyi', aliases: ['ikoyi'], lat: 6.4550, lng: 3.4350, city: 'NG-LAG' },
  { name: 'Ajah', aliases: ['ajah'], lat: 6.4667, lng: 3.5667, city: 'NG-LAG' },
  { name: 'Oshodi', aliases: ['oshodi'], lat: 6.5556, lng: 3.3400, city: 'NG-LAG' },
  { name: 'Murtala Muhammed Airport', aliases: ['mmia', 'murtala muhammed', 'lagos airport', 'airport lagos', 'los airport', 'the airport', 'airport'], lat: 6.5774, lng: 3.3212, city: 'NG-LAG' },
  { name: 'Apapa', aliases: ['apapa'], lat: 6.4489, lng: 3.3592, city: 'NG-LAG' },
  { name: 'Ikorodu', aliases: ['ikorodu'], lat: 6.6194, lng: 3.5105, city: 'NG-LAG' },
  { name: 'Festac', aliases: ['festac town', 'festac'], lat: 6.4667, lng: 3.2833, city: 'NG-LAG' },
  { name: 'Wuse', aliases: ['wuse 2', 'wuse ii', 'wuse'], lat: 9.0765, lng: 7.4620, city: 'NG-ABJ' },
  { name: 'Abuja', aliases: ['abuja', 'fct'], lat: 9.0579, lng: 7.4951, city: 'NG-ABJ' },
  { name: 'Maitama', aliases: ['maitama'], lat: 9.0836, lng: 7.4978, city: 'NG-ABJ' },
  { name: 'Garki', aliases: ['garki'], lat: 9.0333, lng: 7.4833, city: 'NG-ABJ' },
  { name: 'Gwarinpa', aliases: ['gwarinpa'], lat: 9.1089, lng: 7.4095, city: 'NG-ABJ' },
  { name: 'Nnamdi Azikiwe Airport', aliases: ['abuja airport', 'nnamdi azikiwe', 'abv airport'], lat: 9.0068, lng: 7.2632, city: 'NG-ABJ' },
  { name: 'Central Business District', aliases: ['cbd abuja', 'cbd', 'central business district'], lat: 9.0574, lng: 7.4951, city: 'NG-ABJ' },
  { name: 'Port Harcourt', aliases: ['port harcourt', 'ph town'], lat: 4.8156, lng: 7.0134, city: 'NG-PHC' },
  { name: 'Kano', aliases: ['kano'], lat: 12.0022, lng: 8.5219, city: 'NG-KAN' },
  { name: 'Ibadan', aliases: ['ibadan', 'bodija', 'ring road ibadan'], lat: 7.3775, lng: 3.9058, city: 'NG-IBD' },
  { name: 'Onitsha', aliases: ['onitsha', 'main market onitsha'], lat: 6.1415, lng: 6.7840, city: 'NG-ONI' },
  { name: 'Awka', aliases: ['awka'], lat: 6.2075, lng: 7.0710, city: 'NG-AWK' },
  { name: 'Enugu', aliases: ['enugu'], lat: 6.4423, lng: 7.5102, city: 'NG-ENU' },
  { name: 'Benin City', aliases: ['benin city', 'benin'], lat: 6.3350, lng: 5.6194, city: 'NG-BNI' },
  { name: 'Asaba', aliases: ['asaba'], lat: 6.2053, lng: 6.7333, city: 'NG-ASB' },
  { name: 'Aba', aliases: ['aba'], lat: 5.1066, lng: 7.3665, city: 'NG-ENU' },
  { name: 'Owerri', aliases: ['owerri'], lat: 5.4897, lng: 7.0342, city: 'NG-ENU' },
  { name: 'Warri', aliases: ['warri'], lat: 5.5167, lng: 5.7500, city: 'NG-BNI' },
  { name: 'Kaduna', aliases: ['kaduna'], lat: 10.5222, lng: 7.4383, city: 'NG-KAN' },
];

const ALIAS_INDEX = new Map<string, GazetteerPlace>();
for (const p of GAZETTEER) {
  ALIAS_INDEX.set(p.name.toLowerCase(), p);
  for (const a of p.aliases) ALIAS_INDEX.set(a, p);
}

export function matchPlace(text: string): GazetteerPlace | undefined {
  const t = text.toLowerCase();
  let best: GazetteerPlace | undefined;
  let bestLen = 0;
  for (const [alias, place] of ALIAS_INDEX) {
    const rx = new RegExp(`(^|\\b(?:in|at|from|to|na|reach|de|for)\\s)${escapeRx(alias)}\\b`, 'i');
    if (rx.test(t) && alias.length > bestLen) { best = place; bestLen = alias.length; }
  }
  return best;
}

function escapeRx(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function extractLocations(text: string): { origin?: NluEntityLocation; destination?: NluEntityLocation } {
  const t = text.toLowerCase();
  // "from X to Y" / "X to Y" / "X reach Y" (pidgin)
  const fromTo = t.match(/from\s+([a-z0-9 .'-]{2,40}?)\s+(?:to|reach|go)\s+([a-z0-9 .'-]{2,40})$/)
    ?? t.match(/^(?:carry me|take me|drop me)\s+(?:from\s+)?([a-z0-9 .'-]{2,40}?)\s+(?:to|reach)\s+([a-z0-9 .'-]{2,40})$/);
  if (fromTo) {
    const o = matchPlace(fromTo[1]);
    const d = matchPlace(fromTo[2]);
    return {
      origin: o ? { raw: o.name, lat: o.lat, lng: o.lng, source: 'text' } : { raw: fromTo[1].trim(), source: 'text' },
      destination: d ? { raw: d.name, lat: d.lat, lng: d.lng, source: 'text' } : { raw: fromTo[2].trim(), source: 'text' },
    };
  }
  // single place mention → treat as destination
  const single = matchPlace(t);
  if (single) return { destination: { raw: single.name, lat: single.lat, lng: single.lng, source: 'text' } };
  return {};
}

/** OCR-formatted addresses: "Pickup: X. Dropoff: Y" (screenshots, business cards). */
export function extractLabeledLocations(text: string): { origin?: NluEntityLocation; destination?: NluEntityLocation } {
  const t = text.toLowerCase();
  const pickup = t.match(/pickup:?\s+([a-z0-9 .'-]{2,40}?)(?:\.\s|\.$|,|$)/);
  const dropoff = t.match(/drop[\s-]?off:?\s+([a-z0-9 .'-]{2,40}?)(?:\.\s|\.$|,|$)/);
  const o = pickup ? matchPlace(pickup[1]) : undefined;
  const d = dropoff ? matchPlace(dropoff[1]) : undefined;
  const out: { origin?: NluEntityLocation; destination?: NluEntityLocation } = {};
  if (o) out.origin = { raw: o.name, lat: o.lat, lng: o.lng, source: 'text' };
  if (d) out.destination = { raw: d.name, lat: d.lat, lng: d.lng, source: 'text' };
  return out;
}

// ────────────────────────────── Other entities ─────────────────────────────

const CLASSES: Record<string, string> = {
  economy: 'ride.economy', keke: 'ride.economy', standard: 'ride.standard', regular: 'ride.standard',
  premium: 'ride.premium', vip: 'ride.vip', luxury: 'ride.luxury', suv: 'ride.suv',
  chauffeur: 'ride.chauffeur', executive: 'ride.chauffeur', bus: 'transport.intercity',
};

export function extractEntities(text: string): NluEntities {
  const entities: NluEntities = {};
  const { origin, destination } = { ...extractLocations(text), ...extractLabeledLocations(text) };
  if (origin) entities.origin = origin;
  if (destination) entities.destination = destination;

  const t = text.toLowerCase();
  const dt = t.match(/\b(now|asap|immediately|right away|sharp sharp)\b/)
    ?? t.match(/\b(today|tonight|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
    ?? t.match(/\b(?:at|by|around)\s+(\d{1,2})(:(\d{2}))?\s*(am|pm)?/);
  if (dt) {
    const raw = dt[0].trim();
    let iso: string | undefined;
    if (/now|asap|immediately|right away|sharp sharp/.test(raw)) iso = new Date().toISOString();
    else if (raw === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); iso = d.toISOString(); }
    else if (raw === 'today' || raw === 'tonight') iso = new Date().toISOString();
    else if (/\d/.test(raw)) {
      const hm = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
      if (hm) {
        let h = parseInt(hm[1], 10);
        const m = hm[2] ? parseInt(hm[2], 10) : 0;
        const ap = hm[3];
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
        const d = new Date(); d.setHours(h, m, 0, 0);
        iso = d.toISOString();
      }
    }
    entities.datetime = { raw, iso };
  }

  for (const [kw, code] of Object.entries(CLASSES)) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(t)) { entities.serviceClass = code; break; }
  }

  const pax = t.match(/\b(\d)\s*(passengers?|pax|people|persons?|riders?)\b/);
  if (pax) entities.passengers = parseInt(pax[1], 10);

  const nights = t.match(/\b(\d)\s*(night|nights)\b/);
  if (nights) entities.nights = parseInt(nights[1], 10);

  const item = t.match(/\b(document|parcel|package|letter|food|cake|laptop|phone|clothes|shoes|gift|box)\b/);
  if (item) entities.item = item[1];

  const assists: [RegExp, string][] = [
    [/tow/i, 'towing'], [/battery|jump ?start/i, 'battery'], [/fuel|petrol/i, 'fuel_delivery'],
    [/tyre|tire|puncture/i, 'tyre_replacement'], [/mechanic|engine|breakdown|won'?t start|wont start/i, 'mechanical'],
    [/recovery/i, 'vehicle_recovery'],
  ];
  for (const [rx, code] of assists) if (rx.test(t)) { entities.assistType = code; break; }

  return entities;
}

// ────────────────────────────── Sentiment ──────────────────────────────────

const NEG = ['angry', 'terrible', 'worst', 'useless', 'scam', 'stolen', 'refund', 'frustrat', 'annoy', 'poor', 'bad', 'not happy', 'disappointed', 'wahala'];
const POS = ['thanks', 'thank you', 'great', 'good', 'excellent', 'love', 'perfect', 'nice', 'ose', 'daalu', 'na gode', 'e se', 'well done'];

export function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const t = text.toLowerCase();
  const neg = NEG.filter((w) => t.includes(w)).length;
  const pos = POS.filter((w) => t.includes(w)).length;
  if (neg > pos) return 'negative';
  if (pos > neg) return 'positive';
  return 'neutral';
}

// ────────────────────────────── Main classify ──────────────────────────────

export const ESCALATION_THRESHOLD = 0.55;

export function classify(text: string): NluResult {
  const candidates: { intent: WaIntent; score: number }[] = [];
  for (const rule of RULES) {
    let hits = 0;
    for (const p of rule.patterns) if (p.test(text)) hits++;
    if (hits > 0) candidates.push({ intent: rule.intent, score: (rule.weight ?? 1) * Math.min(hits, 2) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const entities = extractEntities(text);
  let intent: WaIntent = 'unknown';
  let confidence = 0;
  let entityFallback = false;
  if (top) {
    intent = top.intent;
    confidence = Math.min(0.98, 0.45 + top.score * 0.15);
    // entity corroboration boosts confidence
    if (entities.origin?.lat && entities.destination?.lat && intent.startsWith('book_')) confidence = Math.min(0.99, confidence + 0.15);
    if (intent === 'greeting' && text.length > 60) confidence *= 0.6; // long greeting-like text is probably not a greeting
  } else if (entities.origin || entities.destination) {
    intent = 'book_transport';
    confidence = entities.origin && entities.destination ? 0.75 : 0.6;
    entityFallback = true;
  } else {
    confidence = 0.2;
  }
  return {
    intent,
    vertical: INTENT_VERTICAL[intent],
    language: detectLanguage(text),
    entities,
    sentiment: analyzeSentiment(text),
    confidence: Math.round(confidence * 100) / 100,
    entityFallback,
  };
}

/** Voice notes & images arrive as media; this wraps their extracted transcript into the same NLU. */
export function classifyTranscript(transcript: string, source: 'voice' | 'image', extracted?: { locations?: NluEntityLocation[] }): NluResult {
  const r = classify(transcript);
  if (extracted?.locations?.length && !r.entities.destination) {
    r.entities.destination = extracted.locations[0];
    if (extracted.locations[1]) r.entities.origin = extracted.locations[1];
  }
  r.confidence = Math.max(0.3, r.confidence - 0.1); // ASR/OCR penalty
  return r;
}
