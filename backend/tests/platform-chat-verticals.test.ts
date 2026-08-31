import { describe, expect, it } from 'vitest';
import { SignalingServer, MessageStore, SmsGateway } from '../libs/chat/src/index';
import {
  VerticalEngine, AIRCRAFT_TYPES, aviationQuote, hotelQuote, hotelCancellation,
  tourismQuote, EXPERIENCES, securityEligible, securityQuote, ROADSIDE_RATES,
  nearestProvider, intercityQuote, INTERCITY_ROUTES, marineQuote, corporateQuote,
} from '../libs/verticals/src/index';

describe('chat — WebRTC signaling, E2EE payloads, moderation, SMS', () => {
  it('rooms: join → offer/answer/ICE relay only between participants', () => {
    const sig = new SignalingServer();
    const room = sig.createRoom();
    sig.join(room, 'caller'); sig.join(room, 'callee'); sig.join(room, 'ops');
    const offer = sig.signal({ roomId: room, from: 'caller', to: 'callee', kind: 'offer', encryptedPayload: 'jwe:…' });
    expect(offer.encryptedPayload.startsWith('jwe')).toBe(true);        // server never sees plaintext
    expect(() => sig.signal({ roomId: room, from: 'intruder', to: 'callee', kind: 'offer', encryptedPayload: 'x' })).toThrow(/not in room/);
    expect(sig.signalsFor(room, 'callee').map((s) => s.kind)).toEqual(['offer']);
  });

  it('bye removes the participant; replayed signals support reconnect', () => {
    const sig = new SignalingServer();
    const room = sig.createRoom();
    sig.join(room, 'a'); sig.join(room, 'b');
    sig.signal({ roomId: room, from: 'a', to: 'b', kind: 'bye', encryptedPayload: '' });
    expect(sig.participants(room)).toEqual(['b']);
  });

  it('moderator kick is authorization-gated', () => {
    const sig = new SignalingServer(['ops_1']);
    const room = sig.createRoom(['ops_1']);
    sig.join(room, 'ops_1'); sig.join(room, 'trouble');
    expect(() => sig.kick(room, 'trouble', 'ops_1')).toThrow(/only moderators/);
    expect(() => sig.kick(room, 'ops_1', 'trouble')).not.toThrow();
  });

  it('WhatsApp thread binding for hybrid support calls', () => {
    const sig = new SignalingServer();
    const room = sig.createRoom();
    const { waRoomId } = sig.bindWhatsApp(room, '+2348012345678');
    expect(waRoomId).toMatch(/^wa_room_/);
    expect(sig.binding(room)!.phone).toBe('+2348012345678');
  });

  it('message store flags banned content and sweeps expired history', () => {
    const store = new MessageStore();
    expect(store.post({ roomId: 'r', from: 'u1', body: 'here is a fraud link' }).flagged).toBe(true);
    expect(store.post({ roomId: 'r', from: 'u1', body: 'driver is here' }).flagged).toBe(false);
    expect(store.flagged()).toHaveLength(1);
    store.history('r').forEach((m) => { m.ts = new Date(Date.now() - 10 * 86_400_000); });   // age them
    expect(store.sweep(7)).toBe(2);                                  // both beyond 7-day retention
  });

  it('SMS gateway: NG numbers only, segments, DLR updates, deterministic failures', async () => {
    const gw = new SmsGateway();
    const ok = await gw.send('+2348012345678', 'Your AMSA code is 123456. Valid 5 minutes.');
    expect(ok.status).toBe('sent');
    expect(ok.segments).toBe(1);
    expect(gw.reportDelivery(ok.messageId, 'delivered').status).toBe('delivered');
    await expect(gw.send('+254712345678', 'nope')).rejects.toThrow(/invalid NG number/);
    const failed = await gw.send('+2348012345677', 'x');
    expect(failed.status).toBe('failed');
  });
});

describe('verticals — engine gating, escrow, completion', () => {
  it('FAMS-disabled verticals refuse quotes and bookings', () => {
    const engine = new VerticalEngine({ module: (code) => code !== 'marine' });
    expect(() => engine.quote('marine', { customerId: 'c', priceOf: () => 1, etaOf: () => 'x' })).toThrow(/FAMS/);
    expect(() => engine.book('marine', { providerId: 'p', customerId: 'c', priceMinor: 1, details: {} })).toThrow(/FAMS/);
  });

  it('booking funds escrow; completion releases; cancellation refunds', () => {
    const ledger: string[] = [];
    const engine = new VerticalEngine(undefined, {
      fund: (id) => { ledger.push(`fund:${id}`); return `esc_${id}`; },
      release: (e) => ledger.push(`release:${e}`),
      refund: (e) => ledger.push(`refund:${e}`),
    });
    engine.register('hotels', { id: 'htl_1', name: 'Eko Suites', rating: 4.7 });
    const b = engine.book('hotels', { providerId: 'htl_1', customerId: 'cus_1', priceMinor: 9_000_000, details: { room: 'deluxe', nights: 2 } });
    expect(b.escrowId).toBe(`esc_${b.id}`);
    engine.complete(b.id);
    expect(ledger).toEqual([`fund:${b.id}`, `release:esc_${b.id}`]);
    const b2 = engine.book('hotels', { providerId: 'htl_1', customerId: 'cus_2', priceMinor: 4_500_000, details: {} });
    engine.cancel(b2.id);
    expect(ledger[3]).toBe(`refund:esc_${b2.id}`);
  });

  it('quotes rank providers by rating then price', () => {
    const engine = new VerticalEngine();
    engine.register('aviation', { id: 'av_1', name: 'Ibom Air Charter', rating: 4.2 });
    engine.register('aviation', { id: 'av_2', name: 'VIP Jets NG', rating: 4.9 });
    const quotes = engine.quote('aviation', { customerId: 'c', priceOf: () => 10_000_000, etaOf: () => 'T-2h' });
    expect(quotes[0].provider.id).toBe('av_2');
  });
});

describe('verticals — pricing & eligibility rules', () => {
  it('aviation: 4 aircraft types, capacity + minimum hire enforced', () => {
    expect(AIRCRAFT_TYPES).toHaveLength(4);
    expect(aviationQuote('helicopter', 180, 4).priceMinor).toBeGreaterThan(0);
    expect(aviationQuote('private_jet', 500, 20)).toMatchObject({ ok: false, reason: expect.stringContaining('seats') });
    expect(aviationQuote('helicopter', 5, 2).priceMinor).toBe(8_000_000);   // minimum hire
  });

  it('hotels: room pricing and the 48h free-cancellation window', () => {
    expect(hotelQuote('deluxe', 3).priceMinor).toBe(21_600_000);
    const early = hotelCancellation({ refundable: true, hoursToCheckIn: 72, priceMinor: 10_000_000 });
    expect(early).toEqual({ refundMinor: 10_000_000, penaltyMinor: 0 });
    const late = hotelCancellation({ refundable: true, hoursToCheckIn: 10, priceMinor: 10_000_000 });
    expect(late.penaltyMinor).toBe(2_000_000);
    const strict = hotelCancellation({ refundable: false, hoursToCheckIn: 72, priceMinor: 10_000_000 });
    expect(strict.refundMinor).toBe(0);
  });

  it('tourism: group discounts at 3+ and 6+ people', () => {
    expect(EXPERIENCES.length).toBeGreaterThanOrEqual(4);
    const solo = tourismQuote('exp_yankari_safari', 1).priceMinor;
    const trio = tourismQuote('exp_yankari_safari', 3).priceMinor;
    const squad = tourismQuote('exp_yankari_safari', 6).priceMinor;
    expect(trio).toBe(Math.round(solo * 3 * 0.95));
    expect(squad).toBe(Math.round(solo * 6 * 0.9));
  });

  it('security: armed services need verified corporate client + police clearance', () => {
    expect(securityEligible('bodyguard', { verifiedCorporate: false, policeClearance: false }).eligible).toBe(true);
    expect(securityEligible('cash_transit', { verifiedCorporate: false, policeClearance: true })).toMatchObject({ eligible: false, reason: expect.stringContaining('corporate') });
    expect(securityEligible('vip_convoy', { verifiedCorporate: true, policeClearance: false })).toMatchObject({ eligible: false, reason: expect.stringContaining('clearance') });
    expect(securityEligible('executive_protection', { verifiedCorporate: true, policeClearance: true }).eligible).toBe(true);
    expect(securityQuote('bodyguard', 2, 8).priceMinor).toBe(450_000 * 2 * 8);
  });

  it('roadside: fixed rates + nearest-available dispatch', () => {
    expect(ROADSIDE_RATES.tow_50km).toBeGreaterThan(ROADSIDE_RATES.jump_start);
    const providers = [
      { id: 'far', lat: 7.0, lng: 3.9, available: true },
      { id: 'near', lat: 6.52, lng: 3.38, available: true },
      { id: 'nearest_busy', lat: 6.51, lng: 3.37, available: false },
    ];
    expect(nearestProvider(providers, { lat: 6.5, lng: 3.4 })!.id).toBe('near');
    expect(nearestProvider([providers[2]], { lat: 6.5, lng: 3.4 })).toBeNull();
  });

  it('intercity routes with seat classes; marine & corporate quote', () => {
    expect(INTERCITY_ROUTES.length).toBeGreaterThanOrEqual(3);
    const regular = intercityQuote('ic_lag_abj', 'regular').priceMinor;
    expect(intercityQuote('ic_lag_abj', 'sleeper').priceMinor).toBe(Math.round(regular * 1.8));
    expect(marineQuote('yacht', 4).priceMinor).toBe(72_000_000);
    expect(corporateQuote('event_logistics', 3, 2).priceMinor).toBe(15_000_000);
  });
});
