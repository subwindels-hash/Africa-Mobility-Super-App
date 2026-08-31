/**
 * Secure in-WhatsApp payment links (docs/26 §Payments).
 * Links are single-use, short-lived, signed (HMAC) and PSP-routed
 * (Paystack → Flutterwave → Monnify failover). No PAN ever enters WhatsApp.
 */
import { createHmac, randomBytes } from 'node:crypto';

export interface PaymentLink {
  id: string;
  bookingRef: string;
  amountMinor: number;
  currency: string;
  url: string;
  psp: 'paystack' | 'flutterwave' | 'monnify';
  expiresAt: Date;
  used: boolean;
}

const SECRET = process.env.AMSA_PAYMENT_LINK_SECRET ?? 'dev-secret-rotate-me';
const TTL_MIN = 15;

const store = new Map<string, PaymentLink>();

export function createPaymentLink(bookingRef: string, amountMinor: number, currency = 'NGN', psp: PaymentLink['psp'] = 'paystack'): PaymentLink {
  const id = `wpl_${randomBytes(8).toString('hex')}`;
  const expiresAt = new Date(Date.now() + TTL_MIN * 60_000);
  const sig = sign(id, bookingRef, amountMinor, expiresAt);
  const link: PaymentLink = {
    id, bookingRef, amountMinor, currency, psp, expiresAt, used: false,
    url: `https://pay.amsa.africa/${id}?ref=${encodeURIComponent(bookingRef)}&exp=${expiresAt.getTime()}&sig=${sig}`,
  };
  store.set(id, link);
  return link;
}

export function verifyPaymentLink(id: string, ref: string, amount: number, exp: number, sig: string): boolean {
  const link = store.get(id);
  if (!link) return false;
  if (link.used || link.bookingRef !== ref || link.amountMinor !== amount) return false;
  if (exp !== link.expiresAt.getTime() || Date.now() > exp) return false;
  return sign(id, ref, amount, link.expiresAt) === sig;
}

export function markUsed(id: string): PaymentLink | undefined {
  const l = store.get(id);
  if (l) l.used = true;
  return l;
}

function sign(id: string, ref: string, amount: number, exp: Date): string {
  return createHmac('sha256', SECRET).update(`${id}.${ref}.${amount}.${exp.getTime()}`).digest('hex').slice(0, 24);
}

export function paymentLinkText(amountMinor: number, currency: string, url: string, minutes = TTL_MIN): string {
  const amt = `${currency === 'NGN' ? '₦' : currency + ' '}${(amountMinor / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  return [
    '🔒 *Secure payment*',
    '',
    `Amount: *${amt}*`,
    `Valid for *${minutes} minutes*. Single use.`,
    '',
    `👉 ${url}`,
    '',
    'Your money is held in *escrow* and only released when the service is completed. Card, bank transfer & USSD accepted.',
  ].join('\n');
}
