import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { PaymentService, makeAdapter } from '../libs/payments/src/index';
import { TravelService, makeGdsAdapter } from '../libs/travel/src/index';

const SECRETS = { paystack: 'pk_test_1', flutterwave: 'fw_test_1', monnify: 'mn_test_1' };

describe('payments — PSP adapters (Paystack/Flutterwave/Monnify)', () => {
  it('initializes hosted checkout with a provider reference', () => {
    const ps = new PaymentService(SECRETS);
    const { record, authorizationUrl } = ps.initialize({ reference: 'PAY-1001', amountMinor: 4_500_000, currency: 'NGN', email: 'a@b.ng' });
    expect(record.status).toBe('initialized');
    expect(record.psp).toBe('paystack');                     // primary PSP first
    expect(authorizationUrl).toContain('paystack/pay/');
  });

  it('webhooks: valid HMAC accepted, invalid signature + replay rejected', () => {
    const settled: string[] = [];
    const ps = new PaymentService(SECRETS, { onSettled: (ref) => settled.push(ref) });
    ps.initialize({ reference: 'PAY-2002', amountMinor: 100, currency: 'NGN', email: 'a@b.ng' });
    const body = JSON.stringify({ reference: 'PAY-2002', status: 'success' });
    const good = createHmac('sha512', SECRETS.paystack).update(body).digest('hex');
    expect(ps.webhook('paystack', body, good, { reference: 'PAY-2002', status: 'success' })).toEqual({ accepted: true });
    expect(settled).toEqual(['PAY-2002']);
    expect(ps.webhook('paystack', body, 'deadbeef', { reference: 'PAY-2002', status: 'success' })).toMatchObject({ accepted: false, reason: 'invalid signature' });
    expect(ps.webhook('paystack', body, good, { reference: 'PAY-2002', status: 'success' })).toMatchObject({ accepted: false, reason: 'replay' });
    expect(settled).toEqual(['PAY-2002']);   // replay settled nothing more
  });

  it('settlement hooks fire for escrow funding; deterministic failure refs', () => {
    const settled: string[] = [];
    const ps = new PaymentService(SECRETS, { onSettled: (ref) => settled.push(ref) });
    ps.initialize({ reference: 'PAY-3003', amountMinor: 100, currency: 'NGN', email: 'a@b.ng' });
    ps.confirm('PAY-3003');
    expect(settled).toEqual(['PAY-3003']);
    ps.initialize({ reference: 'PAY-3099', amountMinor: 100, currency: 'NGN', email: 'a@b.ng' });
    expect(ps.confirm('PAY-3099').status).toBe('failed');    // '99' suffix = PSP decline
  });

  it('refunds are partial-capable and bounded by the paid amount', () => {
    const ps = new PaymentService(SECRETS);
    ps.initialize({ reference: 'PAY-4004', amountMinor: 1_000, currency: 'NGN', email: 'a@b.ng' });
    ps.confirm('PAY-4004');
    ps.refund('PAY-4004', 400);
    expect(ps.get('PAY-4004')!.amountRefundedMinor).toBe(400);
    expect(() => ps.refund('PAY-4004', 10_000)).toThrow(/exceeds/);
    ps.refund('PAY-4004', 600);
    expect(ps.get('PAY-4004')!.status).toBe('refunded');
  });

  it('adapters share one interface across PSPs', () => {
    for (const psp of ['paystack', 'flutterwave', 'monnify'] as const) {
      const a = makeAdapter(psp, 's', 'https://x');
      expect(a.initialize({ reference: 'R', amountMinor: 1, currency: 'NGN', email: 'e' }).providerRef).toContain(psp.slice(0, 3));
    }
  });
});

describe('travel — Amadeus + Sabre GDS engine', () => {
  const q = { origin: 'LOS', destination: 'ABV', departDate: '2026-09-15', passengers: 2, cabin: 'economy' as const };

  it('multi-GDS search is merged and cheapest-first', () => {
    const t = new TravelService();
    const offers = t.search(q);
    expect(offers.length).toBe(6);                    // 3 per GDS
    for (let i = 1; i < offers.length; i++) expect(offers[i].priceMinor).toBeGreaterThanOrEqual(offers[i - 1].priceMinor);
    expect(new Set(offers.map((o) => o.gds))).toEqual(new Set(['amadeus', 'sabre']));
  });

  it('hold → issue produces PNR + e-ticket numbers per passenger and funds escrow', () => {
    const issued: { pnr: string; totalMinor: number }[] = [];
    const t = new TravelService({ onIssued: (pnr, totalMinor) => issued.push({ pnr, totalMinor }) });
    const offers = t.search(q);
    const out = t.book(q, offers[0].id, { payNow: true });
    expect(out.issued!.ticketNumbers).toHaveLength(2);
    expect(out.issued!.pnr).toMatch(/^[A-Z0-9]{6}$/);
    expect(issued[0].totalMinor).toBe(offers[0].priceMinor * 2);
    expect(out.fareRules.length).toBeGreaterThan(0);
  });

  it('seat inventory is enforced at hold time', () => {
    const single = { ...q, passengers: 9 };
    const t = new TravelService();
    const scarce = t.search(single).find((o) => o.seatsLeft < 9)!;
    expect(() => t.book(single, scarce.id)).toThrow(/seats left/);
  });

  it('void/refund follows fare rules — non-refundable tickets refund nothing', () => {
    const t = new TravelService();
    const offers = t.search(q);
    const nonRefundable = offers.find((o) => !o.refundable)!;
    const { issued } = t.book(q, nonRefundable.id, { payNow: true });
    expect(t.cancel(issued!.pnr).refundMinor).toBe(0);
    const refundable = offers.find((o) => o.refundable)!;
    const b2 = t.book(q, refundable.id, { payNow: true });
    expect(t.cancel(b2.issued!.pnr).refundMinor).toBeGreaterThan(0);
  });

  it('GDS adapter pricing exposes change/cancel fee rules', () => {
    const amadeus = makeGdsAdapter('amadeus');
    const [offer] = amadeus.search(q);
    const priced = amadeus.price(offer.id);
    expect(priced.rules.map((r) => r.type)).toEqual(['change', 'cancel']);
  });
});
