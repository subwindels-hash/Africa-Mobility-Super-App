/**
 * Payments Service (docs/08 payment-service).
 * Paystack / Flutterwave / Monnify adapters behind one interface with
 * signature-verified webhooks, idempotency, refunds and automatic PSP
 * failover. Deterministic offline mode mirrors the real API shapes
 * (initialize → reference → webhook verify) so tests run without network.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type PspId = 'paystack' | 'flutterwave' | 'monnify';

export interface PaymentRequest {
  reference: string;
  amountMinor: number;
  currency: 'NGN';
  email: string;
  channel?: 'card' | 'transfer' | 'ussd';
}
export type PaymentStatus = 'initialized' | 'pending' | 'success' | 'failed' | 'refunded';

export interface PaymentRecord extends PaymentRequest {
  psp: PspId;
  status: PaymentStatus;
  providerRef?: string;
  amountRefundedMinor: number;
  attempts: { psp: PspId; at: Date; status: PaymentStatus }[];
}

export interface PspAdapter {
  id: PspId;
  /** POST /transaction/initialize — returns the hosted checkout URL. */
  initialize(req: PaymentRequest): { authorizationUrl: string; providerRef: string };
  /** Webhook signature check per PSP convention (HMAC of raw body). */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  /** Deterministic settlement simulation: refs ending '99' fail (test hooks). */
  settle(req: PaymentRequest): { status: 'success' | 'failed'; providerRef: string; channel: string };
  refund(providerRef: string, amountMinor: number): { status: 'refunded'; refundedMinor: number };
}

export function makeAdapter(id: PspId, secret: string, baseUrl: string): PspAdapter {
  const sigField = id === 'paystack' ? 'x-paystack-signature' : id === 'flutterwave' ? 'verif-hash' : 'monnify-signature';
  void sigField;
  return {
    id,
    initialize(req) {
      const providerRef = `${id.slice(0, 3)}_${req.reference}`;
      return { authorizationUrl: `${baseUrl}/${id}/pay/${providerRef}`, providerRef };
    },
    verifyWebhookSignature(rawBody, signature) {
      const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
      try { return timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); } catch { return false; }
    },
    settle(req) {
      const failed = req.reference.endsWith('99');
      return { status: failed ? 'failed' : 'success', providerRef: `${id.slice(0, 3)}_${req.reference}`, channel: req.channel ?? 'card' };
    },
    refund(providerRef: string, amountMinor: number): { status: 'refunded'; refundedMinor: number; providerRef: string } {
      return { status: 'refunded', refundedMinor: amountMinor, providerRef };
    },
  };
}

export interface EscrowHooks {
  onSettled(reference: string, amountMinor: number): void;
  onRefunded(reference: string, amountMinor: number): void;
}

export class PaymentService {
  private records = new Map<string, PaymentRecord>();
  private adapters: PspAdapter[];

  constructor(
    secrets: Record<PspId, string>,
    private hooks?: EscrowHooks,
    private baseUrl = 'https://checkout.amsa.africa',
    private failureRate = 0,                       // failover test hook for the primary PSP
  ) {
    this.adapters = (['paystack', 'flutterwave', 'monnify'] as PspId[]).map((p) => makeAdapter(p, secrets[p], this.baseUrl));
  }

  /** Initialize with automatic failover across the PSP cascade. */
  initialize(req: PaymentRequest): { record: PaymentRecord; authorizationUrl: string } {
    if (this.records.has(req.reference)) throw new Error(`reference ${req.reference} already exists`);
    const attempts: PaymentRecord['attempts'] = [];
    const record: PaymentRecord = { ...req, psp: 'paystack', status: 'initialized', amountRefundedMinor: 0, attempts };
    for (const adapter of this.adapters) {
      const init = adapter.initialize(req);
      attempts.push({ psp: adapter.id, at: new Date(), status: 'initialized' });
      record.psp = adapter.id;
      record.providerRef = init.providerRef;
      this.records.set(req.reference, record);
      // simulate primary cascade: PSPs before the last are unhealthy when failureRate set
      if (adapter.id !== 'monnify' && Math.random() < this.failureRate) continue;
      return { record, authorizationUrl: init.authorizationUrl };
    }
    return { record, authorizationUrl: `${this.baseUrl}/pay/${req.reference}` };
  }

  get(reference: string): PaymentRecord | undefined { return this.records.get(reference); }

  /** Confirm settlement (driver of the webhook event body in production). */
  confirm(reference: string): PaymentRecord {
    const r = this.records.get(reference);
    if (!r) throw new Error(`unknown payment ${reference}`);
    const adapter = this.adapters.find((a) => a.id === r.psp)!;
    const result = adapter.settle(r);
    r.status = result.status;
    r.attempts.push({ psp: r.psp, at: new Date(), status: result.status });
    if (r.status === 'success') this.hooks?.onSettled(reference, r.amountMinor);
    return r;
  }

  /** Verified webhook ingestion — bad signatures are rejected outright. */
  webhook(psp: PspId, rawBody: string, signature: string, event: { reference: string; status: 'success' | 'failed' }): { accepted: true } | { accepted: false; reason: string } {
    const adapter = this.adapters.find((a) => a.id === psp);
    if (!adapter) return { accepted: false, reason: 'unknown psp' };
    if (!adapter.verifyWebhookSignature(rawBody, signature)) return { accepted: false, reason: 'invalid signature' };
    const r = this.records.get(event.reference);
    if (!r) return { accepted: false, reason: 'unknown reference' };
    if (r.status === 'success' && event.status === 'success') return { accepted: false, reason: 'replay' };
    r.status = event.status;
    r.attempts.push({ psp, at: new Date(), status: event.status });
    if (event.status === 'success') this.hooks?.onSettled(event.reference, r.amountMinor);
    return { accepted: true };
  }

  refund(reference: string, amountMinor?: number): PaymentRecord {
    const r = this.records.get(reference);
    if (!r) throw new Error(`unknown payment ${reference}`);
    if (r.status !== 'success') throw new Error('only successful payments are refundable');
    const amt = amountMinor ?? r.amountMinor - r.amountRefundedMinor;
    if (amt <= 0 || r.amountRefundedMinor + amt > r.amountMinor) throw new Error('refund exceeds paid amount');
    const adapter = this.adapters.find((a) => a.id === r.psp)!;
    adapter.refund(r.providerRef!, amt);
    r.amountRefundedMinor += amt;
    if (r.amountRefundedMinor === r.amountMinor) r.status = 'refunded';
    this.hooks?.onRefunded(reference, amt);
    return r;
  }

  list(): PaymentRecord[] { return [...this.records.values()]; }
}
