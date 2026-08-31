import { describe, expect, it } from 'vitest';
import * as wa from '../libs/whatsapp/src/index';
import * as core from '../libs/core/src/index';
import { evaluate, newFallbackState, fallbackNotice } from '../libs/core/src/domain/comm-fallback';

const PHONE = '+2348012345678';
const say = (text: string, phone = PHONE) => wa.processInbound({ from: phone, type: 'text', text, timestamp: new Date().toISOString() });

describe('AI quotation engine (WhatsApp)', () => {
  it('security quote: 2 agents × days with milestone escrow', () => {
    const q = wa.generateQuote('security', { agents: 2, days: 3 })!;
    // 2×3×₦120k + ₦60k lead vehicle = ₦780k mid → band 0.9×/1.25×
    expect(q.minMinor).toBe(70_200_000);
    expect(q.maxMinor).toBe(97_500_000);
    expect(q.milestones!.map((m) => m.pct).reduce((a, b) => a + b, 0)).toBe(100);
    expect(q.validityHours).toBe(24);
    expect(q.basis).toContain('agents');
  });

  it('aviation quote differentiates helicopter vs jet vs air ambulance', () => {
    const heli = wa.generateQuote('aviation', { serviceType: 'helicopter', hours: 1 })!;
    const jet = wa.generateQuote('aviation', { serviceType: 'private jet', hours: 1 })!;
    const amb = wa.generateQuote('aviation', { serviceType: 'air ambulance', hours: 1 })!;
    expect(heli.minMinor).toBe(250_000_000);          // ₦2.5M
    expect(jet.minMinor).toBe(800_000_000);           // ₦8M
    expect(amb.minMinor).toBe(650_000_000);           // ₦6.5M
    expect(jet.minMinor).toBeGreaterThan(heli.minMinor);
  });

  it('roadside quote matches rate card per assist type', () => {
    const tow = wa.generateQuote('roadside', { assistType: 'towing' })!;
    const fuel = wa.generateQuote('roadside', { assistType: 'fuel_delivery' })!;
    expect(tow.minMinor).toBe(3_500_000);             // ₦35k
    expect(fuel.maxMinor).toBe(3_500_000);            // ₦35k
    expect(wa.formatQuote(tow)).toContain('₦35,000');
  });

  it('accommodation quote scales with nights and stay type', () => {
    const hotel = wa.generateQuote('accommodation', { nights: 2 })!;
    const villa = wa.generateQuote('accommodation', { nights: 2, serviceType: 'vacation rental' })!;
    expect(hotel.minMinor).toBe(9_000_000);           // 2 × ₦45k
    expect(villa.minMinor).toBe(15_000_000);          // 2 × ₦75k
  });

  it('travel returns undefined (live GDS search required)', () => {
    expect(wa.generateQuote('travel', {})).toBeUndefined();
  });

  it('quotes flow into the WhatsApp conversation (hotel booking shows quotation + milestones for security)', async () => {
    wa.sessionStore.clear(); wa.bookingStore.clear();
    const r1 = await say('I need a hotel in Abuja for 3 nights');
    expect(r1.meta.intent).toBe('book_accommodation');
    expect(r1.meta.node).toBe('confirm');
    expect(r1.text).toContain('Quotation');
    expect(r1.text).toContain('₦135,000');            // 3 × ₦45k
    const r2 = await say('1');
    expect(r2.text).toMatch(/BKG-[A-Z0-9]{5}/);
    expect(r2.text).toContain('escrow');
  });

  it('security conversation shows milestone escrow tranches', async () => {
    wa.sessionStore.clear(); wa.bookingStore.clear();
    await say('I need security escort in Lagos tomorrow');
    await say('event security');                       // serviceType
    const r = await say('Victoria Island');            // dropoff (when already from datetime)
    const final = r.meta.node === 'confirm' ? r : await say('tomorrow');
    expect(final.text).toContain('Milestone escrow');
    expect(final.text).toMatch(/Mobilisation 50%/);
  });
});

describe('WhatsApp — availability & service management', () => {
  it('answers availability with the 10 live cities + services', async () => {
    wa.sessionStore.clear(); wa.bookingStore.clear();
    const r = await say('Do you offer dispatch in Lagos?');
    expect(r.meta.intent).toBe('check_availability');
    expect(r.text).toContain('10 cities');
    expect(r.text).toContain('Onitsha');
    expect(r.text).toContain('Lagos');
  });

  it('manage services lists bookings for this number', async () => {
    wa.sessionStore.clear(); wa.bookingStore.clear();
    await say('taxi from Lekki to Ikeja');
    await say('1');
    const r = await say('show my bookings');
    expect(r.meta.intent).toBe('manage_services');
    expect(r.text).toContain('Your bookings');
    expect(r.text).toMatch(/BKG-[A-Z0-9]{5}/);
  });

  it('manage services with no bookings onboards politely', async () => {
    wa.sessionStore.clear(); wa.bookingStore.clear();
    const r = await say('manage my bookings');
    expect(r.meta.intent).toBe('manage_services');
    expect(r.text).toContain('no bookings');
  });
});

describe('Communication fallback engine (auto GSM switch)', () => {
  it('stays on WebRTC for good quality', () => {
    const st = newFallbackState();
    const d = evaluate({ rttMs: 120, packetLossPct: 1, jitterMs: 15 }, st);
    expect(d.channel).toBe('webrtc');
    expect(d.action).toBe('none');
  });

  it('degrades after 2 poor samples, then switches to masked GSM, then SMS', () => {
    const st = newFallbackState();
    const poor = { rttMs: 900, packetLossPct: 18, jitterMs: 140 };
    const d1 = evaluate(poor, st);
    expect(d1.action).toBe('none');                        // streak 1 — hysteresis
    const d2 = evaluate(poor, st);
    expect(d2.action).toBe('reduce_bitrate');              // streak 2 → degraded
    expect(st.current).toBe('webrtc_degraded');
    const d3 = evaluate(poor, st);                         // streak 3
    expect(d3.action).toBe('switch_to_gsm_masked');        // → GSM
    expect(st.current).toBe('pstn_masked');
    expect(d3.notifyCustomer).toBe(true);
    expect(fallbackNotice(d3)).toContain('masked');
    const d5 = evaluate({ consecutiveFailures: 3 }, st);   // GSM leg dead
    expect(d5.action).toBe('send_sms_template');
    expect(st.current).toBe('sms');
  });

  it('recovers to WebRTC after sustained good samples', () => {
    const st = newFallbackState();
    st.current = 'webrtc_degraded';
    const good = { rttMs: 150, packetLossPct: 1, jitterMs: 10 };
    evaluate(good, st); evaluate(good, st);
    const d = evaluate(good, st);                          // 3rd good sample
    expect(d.action).toBe('retry_webrtc');
    expect(st.current).toBe('webrtc');
  });

  it('MOS below 3.2 counts as poor', () => {
    const st = newFallbackState();
    const d1 = evaluate({ mos: 2.4 }, st);
    const d2 = evaluate({ mos: 2.1 }, st);
    expect(d2.action).toBe('reduce_bitrate');
    expect(d1.action).toBe('none');
  });

  it('exported from core index', () => {
    expect(typeof core.evaluate).toBe('function');
    expect(core.THRESHOLDS.poorStreakToDowngrade).toBe(2);
  });
});
