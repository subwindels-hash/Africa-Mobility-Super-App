/**
 * Notification Service (docs/08 notification-service).
 * FCM push, email, SMS, WhatsApp and in-app channels behind one dispatcher
 * with per-user preferences, quiet hours (non-critical deferred), 5-language
 * templates and retry with exponential backoff. Offline providers by default.
 */
export type Channel = 'fcm' | 'email' | 'sms' | 'whatsapp' | 'in_app';
export type TemplateKey = 'otp' | 'booking_confirmed' | 'driver_assigned' | 'trip_started' | 'payment_receipt' | 'shipment_checkpoint' | 'dispute_update' | 'security_alert';
export type Lang = 'en' | 'ha' | 'yo' | 'ig' | 'pcm';

export interface Template { key: TemplateKey; critical: boolean; body: Record<Lang, string> }

const T = (key: TemplateKey, critical: boolean, en: string, ha: string, yo: string, ig: string, pcm: string): Template =>
  ({ key, critical, body: { en, ha, yo, ig, pcm } });

export const TEMPLATES: Record<TemplateKey, Template> = {
  otp: T('otp', true,
    'Your AMSA code is {code}. Valid 5 minutes. Never share it.',
    'Lambar AMSA ta ka ita ce {code}. Tana da ingani na minti 5.',
    'Koodu AMSA rẹ ni {code}. O wulo fún iṣẹjú 5.',
    'Koodu AMSA gị bụ {code}. Ọ dị irè nkeji 5.',
    'Your AMSA code na {code}. E go expire for 5 minutes.'),
  booking_confirmed: T('booking_confirmed', false,
    'Booking {bookingId} confirmed 🎉 {service} — {when}. Escrow protected.',
    'An tabbatar da ajiyar {bookingId} 🎉 {service} — {when}.',
    'Ìṣẹ́dájọ́ {bookingId} ti fọwọ́ sí ✅ {service} — {when}.',
    'Ndenụ {bookingId} akwadowala ✅ {service} — {when}.',
    'Your booking {bookingId} don enter 🎉 {service} — {when}.'),
  driver_assigned: T('driver_assigned', false,
    '{driverName} is on the way — {vehicle}. Track live in the app.',
    '{driverName} na kan hanya — {vehicle}.',
    '{driverName} ń bọ̀ — {vehicle}. Tẹ̀lé àwọn lásapè.',
    '{driverName} na n\'ụzọ — {vehicle}.',
    '{driverName} dey come — {vehicle}.'),
  trip_started: T('trip_started', false, 'Your trip has started. Enjoy the ride!', 'Tafiyarka ta fara. Lafiya lau!', 'Ìrìnàjò rẹ ti bẹ̀rẹ̀. Ìrìn kíkùn!', 'Njem gị amalitela. Nke ọma!', 'Your trip don start. Enjoy!'),
  payment_receipt: T('payment_receipt', false, 'Payment of ₦{amount} received for {bookingId}. Receipt in app.', 'An karbi ₦{amount} don {bookingId}.', 'Ti gba ₦{amount} fún {bookingId}.', 'Anatala ₦{amount} maka {bookingId}.', 'We don receive ₦{amount} for {bookingId}.'),
  shipment_checkpoint: T('shipment_checkpoint', false, 'Shipment {shipmentId} at {label}. ETA {eta}.', 'Kaya {shipmentId} a {label}.', 'Ọkò {shipmentId} ní {label}.', 'Mbu {shipmentId} no {label}.', 'Your cargo {shipmentId} dey {label}.'),
  dispute_update: T('dispute_update', false, 'Dispute {caseId} update: {state}.', 'Sabani {caseId}: {state}.', 'Ìjà {caseId}: {state}.', 'Esemokwu {caseId}: {state}.', 'Dispute {caseId} update: {state}.'),
  security_alert: T('security_alert', true, 'Security: {detail}. If this wasn\'t you, secure your account now.', 'Tsaro: {detail}.', 'Ìkọ́ ìṣọ̀ wọ́: {detail}.', 'Nchekwa: {detail}.', 'Security: {detail}. No be you? Lock your account sharp sharp.'),
};

export interface Preferences { channels: Record<Channel, boolean>; language: Lang; quietHours?: { start: number; end: number } }
const DEFAULT_PREFS: Preferences = { channels: { fcm: true, email: true, sms: true, whatsapp: true, in_app: true }, language: 'en', quietHours: { start: 22, end: 6 } };

export interface SendResult { to: string; channel: Channel; template: TemplateKey; rendered: string; deferredQuietHours: boolean; attempts: number }

export interface ChannelProvider { send(to: string, body: string): Promise<{ delivered: boolean }>; failuresUntilDown?: number }

export class NotificationService {
  private prefs = new Map<string, Preferences>();
  private outbox: SendResult[] = [];
  private providers: Record<Channel, ChannelProvider> = {
    fcm: { send: async () => ({ delivered: true }) },
    email: { send: async () => ({ delivered: true }) },
    sms: { send: async () => ({ delivered: true }) },
    whatsapp: { send: async () => ({ delivered: true }) },
    in_app: { send: async () => ({ delivered: true }) },
  };

  setPreferences(userId: string, p: Partial<Preferences>) { this.prefs.set(userId, { ...DEFAULT_PREFS, ...this.prefs.get(userId), ...p, channels: { ...DEFAULT_PREFS.channels, ...(this.prefs.get(userId)?.channels ?? {}), ...(p.channels ?? {}) } }); }
  preferences(userId: string): Preferences { return this.prefs.get(userId) ?? DEFAULT_PREFS; }
  /** Test hook — inject a flaky provider to exercise retry. */
  setProvider(channel: Channel, provider: ChannelProvider) { this.providers[channel] = provider; }

  /** Quiet hours: 22:00–06:00 WAT defer non-critical notifications. */
  inQuietHours(prefs: Preferences, hour = new Date().getUTCHours() + 1): boolean {
    const { start, end } = prefs.quietHours ?? { start: 22, end: 6 };
    return hour >= start || hour < end;
  }

  render(template: TemplateKey, lang: Lang, vars: Record<string, string | number>): string {
    let body = TEMPLATES[template].body[lang] ?? TEMPLATES[template].body.en;
    for (const [k, v] of Object.entries(vars)) body = body.replaceAll(`{${k}}`, String(v));
    return body;
  }

  async send(p: { userId: string; to: string; channel: Channel; template: TemplateKey; vars?: Record<string, string | number>; at?: Date }): Promise<SendResult> {
    const prefs = this.preferences(p.userId);
    if (!prefs.channels[p.channel]) throw new Error(`${p.channel} disabled in user preferences`);
    const critical = TEMPLATES[p.template].critical;
    const defer = !critical && this.inQuietHours(prefs, (p.at ?? new Date()).getUTCHours() + 1);
    const rendered = this.render(p.template, prefs.language, p.vars ?? {});
    let attempts = 0; let delivered = false;
    if (!defer) {
      for (let i = 0; i < 3 && !delivered; i++) {
        attempts++;
        delivered = (await this.providers[p.channel].send(p.to, rendered)).delivered;
        if (!delivered) await new Promise((r) => setTimeout(r, 2 ** i));
      }
    }
    const result: SendResult = { to: p.to, channel: p.channel, template: p.template, rendered, deferredQuietHours: defer, attempts };
    this.outbox.push(result);
    return result;
  }

  list(userId?: string): SendResult[] { return this.outbox.filter((o) => !userId || o.to === userId); }
}
