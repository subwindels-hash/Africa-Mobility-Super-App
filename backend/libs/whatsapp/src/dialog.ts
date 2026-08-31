/**
 * AMSA WhatsApp Dialog Manager — session memory, slot filling, multilingual
 * replies (EN/Hausa/Yoruba/Igbo/Pidgin), booking confirmation & receipts.
 */
import type { NluEntities, NluResult, WaLanguage } from './nlu';
import { computeFare, type FareBreakdown } from '../../core/src/domain/fare-engine';
import type { Money } from '../../core/src/domain/types';

export type DialogNode =
  | 'greeting' | 'collect_slots' | 'confirm' | 'payment'
  | 'completed' | 'tracking' | 'wallet' | 'escalated' | 'support';

export interface BookingDraft {
  intent: string;
  vertical: string;
  slots: Partial<Record<SlotKey, string | number | undefined>>;
  required: SlotKey[];
  estimate?: FareBreakdown;
  quoteRef?: string;
}

export type SlotKey =
  | 'pickup' | 'dropoff' | 'when' | 'class' | 'item' | 'passengers'
  | 'originCity' | 'destinationCity' | 'assistType' | 'nights' | 'guests' | 'serviceType';

export interface WaSession {
  phone: string;
  language: WaLanguage;
  node: DialogNode;
  draft?: BookingDraft;
  lastBookingId?: string;
  history: { role: 'customer' | 'ai'; text: string; at: string }[];
  escalated?: boolean;
  createdAt: string;
}

const SLOT_PROMPTS: Record<SlotKey, Partial<Record<WaLanguage, string>> & { en: string }> = {
  pickup: { en: '📍 Where are you picking up from? (share a location pin or type the address)', pcm: '📍 Where you dey? Send location or type the address', ha: '📍 Ina kake a yanzu? (aika wurin ko rubuta adireshi)', yo: '📍 Nibo ni o wa? (fi pin ranṣẹ tabi kọ adirẹsi)', ig: '། Εbe ole nọ? (zipu ebe ahụ ma ọ bụ dee adreesị)' },
  dropoff: { en: '🏁 Where are you going to?', pcm: '_checkpoint Where you dey go?', ha: 'Checkpoint Zuva ina zaka?', yo: 'Checkpoint Nibo ni o n lọ?', ig: 'Checkpoint Ebee ka ị na-aga?' },
  when: { en: '🕐 When do you need it? (e.g. *now*, *tomorrow 8am*, *Friday 4pm*)', pcm: '🕐 When you need am? (like *now*, *tomorrow 8am*)', ha: '🕐 Yaushe kake bukata?', yo: '🕐 Igbawo ni o nfe?', ig: '🕐 Kedụ mgbe ịchọrọ ya?' },
  class: { en: '🚗 Which class? (Economy · Standard · Premium · VIP · SUV · Chauffeur)', pcm: '🚗 Which level? (Economy · Standard · Premium · VIP · SUV · Chauffeur)', ha: '🚗 Wanne aji? (Economy · Standard · Premium · VIP · SUV · Chauffeur)', yo: '🚗 Élo akindi? (Economy · Standard · Premium · VIP · SUV · Chauffeur)', ig: '🚗 Kedụ ụdị? (Economy · Standard · Premium · VIP · SUV · Chauffeur)' },
  item: { en: '📦 What are you sending? (document, parcel, food, …)', pcm: '📦 Wetin you dey send?', ha: '📦 Menene kake aikawa?', yo: '📦 Kini o n fi ranṣẹ?', ig: '🧦 Kedụ ihe ị na-ezite?' },
  passengers: { en: '👥 How many passengers?', pcm: '👥 How many people?', ha: '👥 Nawa mutane?', yo: '👥 Ẹlo ènìyàn?', ig: '👥 Ọtụtụ mmadụ?' },
  originCity: { en: '🛫 Flying from which city?', pcm: '🛫 Flight from which city?', ha: '🛫 Jirgi daga wane birni?', yo: '🛫 Nibí ti n fò kuro?', ig: '🛫 Na ebe ole ị na-efe efe?' },
  destinationCity: { en: '🛬 Flying to which city?', pcm: '🛬 Flight go which city?', ha: '🛬 Jirgi zuwa wane birni?', yo: '🛬 Nibí ti n fò lọ?', ig: '🛬 Ebee ka ị na-efe ala?' },
  assistType: { en: '🛠 What kind of assistance? (Towing · Battery · Fuel delivery · Tyre · Mechanical)', pcm: '🛠 Wetin happen? (Tow · Battery · Fuel · Tyre · Mechanic)', ha: '🛠 Wane taimako? (Tow · Battery · Fuel · Tyre · Mechanic)', yo: '🛠 Irú ìrànlọwọ wo? (Tow · Batiri · Epo · Taya · Mechanic)', ig: '🛠 Kedụ ụdị enyemaka? (Tow · Batrị · Mmanụ · Taya · Mechanic)' },
  nights: { en: '🗓 How many nights?', pcm: '🗓 How many night?', ha: '🗓 Nawa dare?', yo: '🗓 Ẹlo òrù?', ig: '🗓 Ọtụtụ ụra?' },
  guests: { en: '👥 How many guests?', pcm: '👥 How many person?', ha: '👥 Nawa baki?', yo: '👥 Ẹlo àlejò?', ig: '👥 Ọtụtụ ndị ọbịa?' },
  serviceType: { en: '🛡 Which service? (Executive protection · VIP escort · Security driver · Event security · Residential)', pcm: '🛡 Which one you need?', ha: '🛡 Wane sabis?', yo: '🛡 Irú iṣẹ wo?', ig: '🛡 Kedụ ọrụ?' },
};

// required slots per intent — kept minimal for speed (WhatsApp UX: ≤3 questions)
const INTENT_SLOTS: Record<string, { required: SlotKey[]; optional: SlotKey[] }> = {
  book_transport: { required: ['pickup', 'dropoff'], optional: ['when', 'class'] },
  book_logistics: { required: ['pickup', 'dropoff'], optional: ['when', 'item'] },
  book_travel: { required: ['originCity', 'destinationCity', 'when'], optional: ['passengers'] },
  book_aviation: { required: ['originCity', 'destinationCity', 'when'], optional: ['passengers'] },
  book_security: { required: ['serviceType', 'dropoff', 'when'], optional: ['passengers'] },
  book_accommodation: { required: ['destinationCity', 'nights'], optional: ['guests', 'when'] },
  roadside_assist: { required: ['assistType', 'pickup'], optional: ['when'] },
};

export const VERTICAL_LABEL: Record<string, string> = {
  transportation: 'Ride', logistics: 'Delivery', travel: 'Flight', aviation: 'Charter',
  security: 'Security', accommodation: 'Stay', roadside: 'Roadside assistance',
};

export function newSession(phone: string): WaSession {
  return { phone, language: 'en', node: 'greeting', history: [], createdAt: new Date().toISOString() };
}

export function startDraft(nlu: NluResult, session: WaSession): BookingDraft {
  const conf = INTENT_SLOTS[nlu.intent] ?? { required: ['pickup', 'dropoff'], optional: [] };
  const draft: BookingDraft = {
    intent: nlu.intent, vertical: nlu.vertical ?? 'transportation',
    slots: {}, required: conf.required,
  };
  fillSlots(draft, nlu.entities);
  session.draft = draft;
  session.node = 'collect_slots';
  return draft;
}

/** Map NLU entities → draft slots. */
export function fillSlots(draft: BookingDraft, e: NluEntities): void {
  const s = draft.slots;
  if (e.origin?.raw) s.pickup = e.origin.raw;
  if (e.destination?.raw) {
    if (draft.vertical === 'travel' || draft.vertical === 'aviation') s.destinationCity = e.destination.raw;
    else if (draft.vertical === 'accommodation') s.destinationCity = e.destination.raw;
    else s.dropoff = e.destination.raw;
  }
  if (e.datetime?.iso || e.datetime?.raw) s.when = e.datetime?.iso ?? e.datetime?.raw;
  if (e.serviceClass) s.class = e.serviceClass;
  if (e.item) s.item = e.item;
  if (e.passengers) s.passengers = e.passengers;
  if (e.nights) s.nights = e.nights;
  if (e.assistType) s.assistType = e.assistType;
}

export function nextMissingSlot(draft: BookingDraft): SlotKey | undefined {
  return draft.required.find((k) => draft.slots[k] === undefined || draft.slots[k] === '');
}

export function slotPrompt(slot: SlotKey, lang: WaLanguage): string {
  const p = SLOT_PROMPTS[slot];
  return (p[lang] ?? p.en).replace('_checkpoint', '🏁').replace('।', '📍');
}

/** Fare estimate for the draft (rides/logistics via core fare engine). */
export function estimateFor(draft: BookingDraft): FareBreakdown | undefined {
  const pickup = draft.slots.pickup as string | undefined;
  const dropoff = draft.slots.dropoff as string | undefined;
  if (!pickup || !dropoff) return undefined;
  if (draft.vertical === 'transportation' || draft.vertical === 'logistics') {
    return computeFare({ pickup: { lat: 6.45, lng: 3.4 }, dropoff: { lat: 6.6, lng: 3.35 } }); // geocode-resolved in prod
  }
  return undefined;
}

export function formatNaira(minor: number): string {
  return `₦${(minor / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

/** Confirmation summary — WhatsApp formatting (*bold*, bullets). */
export function confirmSummary(draft: BookingDraft, estimate: FareBreakdown | undefined, quoteRef: string): string {
  const lines = [
    `*Please confirm your ${VERTICAL_LABEL[draft.vertical] ?? 'booking'}:*`,
    '',
    ...Object.entries(draft.slots)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `• ${SLOT_LABEL[k as SlotKey] ?? k}: *${String(v)}*`),
  ];
  if (estimate) {
    lines.push('', `💰 Estimated fare: *${formatNaira(estimate.range.min)} – ${formatNaira(estimate.range.max)}*`);
    if (estimate.surge > 1) lines.push(`⚡ Demand is high (${estimate.surge}×, capped at 2.0×)`);
  }
  if (draft.vertical === 'security' || draft.vertical === 'aviation' || draft.vertical === 'accommodation' || draft.vertical === 'travel') {
    lines.push('', '🧾 Quote reference: ' + quoteRef + ' — verified vendors will confirm price shortly.');
  }
  lines.push('', 'Reply *1* to confirm and pay 🔒 (escrow-protected) or *2* to change something.');
  return lines.join('\n');
}

export const SLOT_LABEL: Partial<Record<SlotKey, string>> = {
  pickup: 'Pickup', dropoff: 'Destination', when: 'When', class: 'Class', item: 'Item',
  passengers: 'Passengers', originCity: 'From', destinationCity: 'To',
  assistType: 'Assistance', nights: 'Nights', guests: 'Guests', serviceType: 'Service',
};

export function receiptText(bookingId: string, total: Money, vendor: string, lang: WaLanguage = 'en'): string {
  const s = {
    en: `✅ *Booked!*\n\n🧾 Booking: ${bookingId}\n🚗 ${vendor} (verified ✓)\n💰 ${formatNaira(total.amount)} — held in *escrow* until completion 🔒\n\nI'll send live tracking in your next message. Safe journey! 🙏`,
    pcm: `✅ *E don book!*\n\n🧾 Booking: ${bookingId}\n🚗 ${vendor} (verified ✓)\n💰 ${formatNaira(total.amount)} — money dey *escrow* safe 🔒\n\nI go send you tracking now. Safe journey! 🙏`,
    ha: `✅ *An gama da buhatar!* 🧾 ${bookingId} · 🚗 ${vendor} · 💰 ${formatNaira(total.amount)} (a kiyaye a escrow 🔒)`,
    yo: `✅ *Ti ṣààyọ̀ wọlé!* 🧾 ${bookingId} · 🚗 ${vendor} · 💰 ${formatNaira(total.amount)} (wà ní escrow 🔒)`,
    ig: `✅ *Edebela! * 🧾 ${bookingId} · 🚗 ${vendor} · 💰 ${formatNaira(total.amount)} (nọ na escrow 🔒)`,
  };
  return s[lang] ?? s.en;
}

export function trackText(status: string, etaSec: number, driver: string, lang: WaLanguage = 'en'): string {
  const mins = Math.max(1, Math.round(etaSec / 60));
  const map: Record<string, string> = {
    en: `📍 *Live tracking*\n\nStatus: *${status}*\nDriver: ${driver} 🚗\nETA: *${mins} min*\n\n🔗 https://share.amsa.africa/live\n🆘 SOS is always 1 tap away in the app.`,
    pcm: `📍 *Tracking dey live*\n\nStatus: *${status}*\nDriver: ${driver} 🚗\nE go reach: *${mins} min*\n\n🔗 https://share.amsa.africa/live`,
  };
  return map[lang] ?? map.en;
}

export function greetingText(lang: WaLanguage, name?: string): string {
  const g = {
    en: `Hello${name ? ' ' + name : ''} and welcome! 🙌\n\nI'm *Ada*, your AMSA assistant. I can help you with:\n\n🚗 Rides (taxi → luxury → chauffeur)\n📦 Deliveries & dispatch\n✈️ Flights & 🚁 private charters\n🛡 Verified security services\n🏨 Hotels & short-lets\n🛠 Roadside assistance\n💳 Wallet, payments & tracking\n\n*What can I do for you today?*`,
    pcm: `How far${name ? ' ' + name : ''}! 🙌 Welcome to AMSA.\n\nI be *Ada*, your assistant. I fit help you with:\n\n🚗 Taxi (economy reach luxury)\n📦 Delivery & dispatch\n✈️ Flight & 🚁 private jet\n🛡 Security (verified people dem)\n🏨 Hotel & short-let\n🛠 Roadside help\n💳 Wallet, payment & tracking\n\n*Wetin I go do for you?*`,
    ha: `Sannu${name ? ' ' + name : ''}! 🙌 Barka da zuwa AMSA.\n\nNi ne *Ada*, mataimakiyarka: motoci 🚗, bayanai 📦, jirgi ✈️🚁, tsaro 🛡, otal 🏨, da taimakon hanya 🛠.\n\n*Yaya zan taimaka?*`,
    yo: `Ẹ káàbọ̀${name ? ' ' + name : ''}! 🙌 Wá sí AMSA.\n\nMo jẹ́ *Ada*, olùrànlọwọ rẹ: ọkọ 🚗, iṣẹ́ ránṣẹ́ 📦, ọkọ̀ òfurufú ✈️🚁, ààbọ̀ 🛡, hótẹ́lì 🏨, ìrànlọwọ́ ọ̀nà 🛠.\n\n*Báwo ni mo lè ràn yín lọ́wọ́?*`,
    ig: `Ndewo${name ? ' ' + name : ''}! 🙌 Nnọọ na AMSA.\n\nAbụ m *Ada*, onye inyeaka gị: ụgbọ 🚗, mbufe 📦, ụgbọ elu ✈️🚁, nchebe 🛡, họtel 🏨, enyemaka ụzọ 🛠.\n\n*Kedu otu m nwere ike inyere gị aka?*`,
  };
  return g[lang] ?? g.en;
}

export function escalationText(lang: WaLanguage = 'en'): string {
  const s: Record<string, string> = {
    en: '🧑🏾‍💻 Connecting you to a *live agent* now — typical wait under 2 minutes. Your conversation history is shared so you won\'t repeat yourself.',
    pcm: '🧑🏾‍💻 I dey connect you to *human agent* now — e no go pass 2 minute. Don\'t worry, dem don see everything wey we talk.',
  };
  return s[lang] ?? s.en;
}
