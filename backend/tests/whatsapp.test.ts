import { describe, expect, it, beforeEach } from 'vitest';
import * as wa from '../libs/whatsapp/src/index';
const { processInbound, setMediaPipeline, mediaPipeline } = wa;

const PHONE = '+2348012345678';
const msg = (text: string, phone = PHONE) => ({ from: phone, type: 'text' as const, text, timestamp: new Date().toISOString() });
const say = (text: string, phone = PHONE) => wa.processInbound(msg(text, phone));

beforeEach(() => {
  wa.sessionStore.clear();
  wa.bookingStore.clear();
});

describe('NLU — language detection', () => {
  it('detects English, Pidgin, Hausa, Yoruba, Igbo', () => {
    expect(wa.detectLanguage('I need a taxi to Ikeja')).toBe('en');
    expect(wa.detectLanguage('Abeg I wan carry parcel go Yaba')).toBe('pcm');
    expect(wa.detectLanguage('Sannu, ina son motoci')).toBe('ha');
    expect(wa.detectLanguage('Bawo, mo fe lo si Ikeja')).toBe('yo');
    expect(wa.detectLanguage('Kedu, biko nyere m aka')).toBe('ig');
  });
});

describe('NLU — intent classification across all 8 service families', () => {
  it('transportation', () => {
    expect(wa.classify('I need a taxi from Lekki to Ikeja').intent).toBe('book_transport');
    expect(wa.classify('Carry me go Airport').language).toBe('pcm');
    expect(wa.classify('I need airport pickup tomorrow').intent).toBe('book_transport');
    expect(wa.classify('Executive chauffeur for my oga').intent).toBe('book_transport');
    expect(wa.classify('VIP transport to the event').intent).toBe('book_transport');
  });

  it('logistics', () => {
    expect(wa.classify('I want dispatch delivery').intent).toBe('book_logistics');
    expect(wa.classify('Send a document to Yaba').intent).toBe('book_logistics');
    expect(wa.classify('Parcel delivery to Abuja').intent).toBe('book_logistics');
    expect(wa.classify('I need a courier for a package').intent).toBe('book_logistics');
  });

  it('travel', () => {
    expect(wa.classify('I want to book a flight to Abuja').intent).toBe('book_travel');
    expect(wa.classify('Flight from Lagos tomorrow').intent).toBe('book_travel');
  });

  it('aviation (beats travel when specific)', () => {
    expect(wa.classify('I need a helicopter charter').intent).toBe('book_aviation');
    expect(wa.classify('private jet to Abuja').intent).toBe('book_aviation');
    expect(wa.classify('air ambulance needed urgently').intent).toBe('book_aviation');
  });

  it('security', () => {
    expect(wa.classify('I need security escort').intent).toBe('book_security');
    expect(wa.classify('Executive protection for a VIP visitor').intent).toBe('book_security');
  });

  it('accommodation', () => {
    expect(wa.classify('I need a hotel in Abuja').intent).toBe('book_accommodation');
    expect(wa.classify('short let for 3 nights').intent).toBe('book_accommodation');
  });

  it('roadside assistance', () => {
    expect(wa.classify('My car wont start, I need a mechanic').intent).toBe('roadside_assist');
    expect(wa.classify('I need towing, breakdown on third mainland').intent).toBe('roadside_assist');
    expect(wa.classify('Ran out of fuel, fuel delivery please').intent).toBe('roadside_assist');
    expect(wa.classify('I have a flat tyre').intent).toBe('roadside_assist');
    expect(wa.classify('Battery assistance, car is dead').intent).toBe('roadside_assist');
  });

  it('tracking, wallet, support', () => {
    expect(wa.classify('Where is my rider?').intent).toBe('track_order');
    expect(wa.classify('Track my package').intent).toBe('track_order');
    expect(wa.classify('What is my wallet balance').intent).toBe('wallet_balance');
    expect(wa.classify('I want to fund my wallet').intent).toBe('wallet_fund');
    expect(wa.classify('I need a refund now').intent).toBe('refund_support');
    expect(wa.classify('I want to talk to a human agent').intent).toBe('human_agent');
  });
});

describe('NLU — entities', () => {
  it('extracts origin/destination from "from X to Y"', () => {
    const e = wa.classify('I need a taxi from Lekki to Ikeja').entities;
    expect(e.origin?.raw).toBe('Lekki');
    expect(e.destination?.raw).toBe('Ikeja');
    expect(e.origin?.lat).toBeCloseTo(6.44, 1);
  });

  it('understands pidgin "X reach Y"', () => {
    const e = wa.classify('carry me from VI reach Yaba').entities;
    expect(e.origin?.raw).toBe('Victoria Island');
    expect(e.destination?.raw).toBe('Yaba');
  });

  it('parses datetimes', () => {
    expect(wa.classify('airport pickup tomorrow').entities.datetime?.raw).toBe('tomorrow');
    expect(wa.classify('taxi to Ikeja at 4pm').entities.datetime?.iso).toBeTruthy();
    expect(wa.classify('ride now sharp sharp').entities.datetime?.raw).toMatch(/now|sharp/);
  });

  it('captures class, passengers, item, nights, assist type', () => {
    expect(wa.classify('VIP taxi').entities.serviceClass).toBe('ride.vip');
    expect(wa.classify('SUV ride for 4 passengers').entities.passengers).toBe(4);
    expect(wa.classify('send a document').entities.item).toBe('document');
    expect(wa.classify('hotel for 3 nights').entities.nights).toBe(3);
    expect(wa.classify('I need fuel delivery').entities.assistType).toBe('fuel_delivery');
  });

  it('gazetteer covers the 10 launch cities', () => {
    for (const city of ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan', 'Onitsha', 'Awka', 'Enugu', 'Benin City', 'Asaba']) {
      expect(wa.matchPlace(`take me to ${city}`)?.name).toBe(city);
    }
  });
});

describe('Dialog — full booking conversation', () => {
  it('books a taxi end-to-end with slot filling, escrow & payment link', async () => {
    const r1 = await say('Hello');
    expect(r1.text).toContain('Ada');
    expect(r1.meta.intent).toBe('greeting');

    const r2 = await say('I need a taxi from Lekki to Ikeja');
    expect(r2.meta.intent).toBe('book_transport');
    expect(r2.meta.node).toBe('confirm');           // both slots came in one message
    expect(r2.text).toContain('Pickup: *Lekki*');
    expect(r2.text).toContain('Destination: *Ikeja*');
    expect(r2.text).toMatch(/₦[\d,]+ – ₦[\d,]+/);   // fare range from core fare engine

    const r3 = await say('1');                       // confirm
    expect(r3.meta.node).toBe('payment');
    expect(r3.text).toMatch(/BKG-[A-Z0-9]{5}/);
    expect(r3.text).toContain('escrow');
    expect(r3.text).toContain('https://pay.amsa.africa/');  // secure payment link

    const r4 = await say('Track my driver');
    expect(r4.text).toContain('Live tracking');
    expect(r4.text).toContain('ETA');
  });

  it('asks for missing slots one at a time', async () => {
    await say('I want dispatch delivery');
    const r2 = await say('Ajah');                    // answers pickup prompt
    expect(r2.meta.node).toBe('collect_slots');      // still needs dropoff
    const r3 = await say('Yaba');
    expect(r3.meta.node).toBe('confirm');
    expect(r3.text).toContain('Ajah');
    expect(r3.text).toContain('Yaba');
  });

  it('accepts a WhatsApp location pin as a slot answer', async () => {
    await say('I need a taxi to the airport');
    const pin = await wa.processInbound({
      from: PHONE, type: 'location', timestamp: new Date().toISOString(),
      location: { lat: 6.4281, lng: 3.4219, label: 'Victoria Island' },
    });
    expect(pin.meta.node).toBe('confirm');           // pin filled pickup → ready
    expect(pin.text).toContain('Victoria Island');
  });

  it('change flow (reply 2) re-asks a slot', async () => {
    await say('taxi from Lekki to Ikeja');
    const r = await say('2');
    expect(r.meta.node).toBe('collect_slots');
    expect(r.text).toMatch(/Pickup|Where/i);
  });

  it('cancels a booking with escrow refund messaging', async () => {
    await say('taxi from Lekki to Ikeja');
    await say('1');
    const r = await say('cancel');
    expect(r.text).toContain('cancelled');
    expect(r.text).toContain('Refund');
  });
});

describe('Wallet & payment links', () => {
  it('wallet balance reply', async () => {
    const r = await say('What is my wallet balance');
    expect(r.text).toContain('AMSA wallet');
    expect(r.text).toMatch(/₦[\d,]+/);
  });

  it('fund wallet generates a signed payment link', async () => {
    const r = await say('fund my wallet');
    expect(r.text).toContain('pay.amsa.africa');
    const link = wa.createPaymentLink('TEST-1', 250_000);
    expect(wa.verifyPaymentLink(link.id, link.bookingRef, link.amountMinor, link.expiresAt.getTime(), link.url.split('sig=')[1])).toBe(true);
    // tampered signature rejected
    expect(wa.verifyPaymentLink(link.id, link.bookingRef, link.amountMinor, link.expiresAt.getTime(), 'deadbeef')).toBe(false);
    // single-use
    wa.markUsed(link.id);
    expect(wa.verifyPaymentLink(link.id, link.bookingRef, link.amountMinor, link.expiresAt.getTime(), link.url.split('sig=')[1])).toBe(false);
  });
});

describe('Voice, image & multilingual', () => {
  it('processes a voice note through the ASR adapter', async () => {
    wa.setMediaPipeline({
      ...wa.mediaPipeline,
      transcribe: async () => 'I need a taxi from Yaba to Ikeja',
    });
    const r = await wa.processInbound({ from: PHONE, type: 'audio', mediaId: 'media_1', timestamp: new Date().toISOString() });
    expect(r.meta.intent).toBe('book_transport');
    expect(r.text).toContain('Yaba');
  });

  it('processes an address screenshot through the OCR adapter', async () => {
    wa.setMediaPipeline({
      ...wa.mediaPipeline,
      extractFromImage: async () => ({
        ocrText: 'Pickup: Murtala Muhammed Airport. Dropoff: Ikeja City Mall',
        locations: [],
      }),
    });
    const r = await wa.processInbound({ from: PHONE, type: 'image', mediaId: 'media_2', timestamp: new Date().toISOString() });
    expect(r.text).toContain('Murtala Muhammed Airport');
  });

  it('replies in Pidgin when customer writes Pidgin', async () => {
    const r = await say('How far');
    expect(r.text).toContain('Wetin I go do for you');
  });

  it('receipt localizes for Pidgin confirmation', async () => {
    await say('How far');
    await say('abeg I wan carry parcel from Lekki reach Yaba');
    const r = await say('1');
    expect(r.text).toContain('E don book');
  });
});

describe('Escalation & security', () => {
  it('escalates when confidence is below threshold', async () => {
    const r = await say('xkcd qwerty zzzzz');        // unclassifiable
    expect(r.meta.escalated).toBe(true);
    expect(r.text).toContain('live agent');
  });

  it('escalates on explicit agent request and stays with the human', async () => {
    const r1 = await say('I want to talk to a human agent');
    expect(r1.meta.escalated).toBe(true);
    const r2 = await say('hello?');
    expect(r2.meta.node).toBe('escalated');
    expect(r2.escalated ?? r2.meta.escalated).toBeTruthy();
  });

  it('negative sentiment with low confidence escalates', async () => {
    const r = await say('this is bad, I am not happy, wrong charge');
    expect(r.meta.escalated).toBe(true);
  });
});

describe('Webhook', () => {
  it('verify endpoint echoes hub.challenge', async () => {
    wa; // webhook tested via HTTP in api tests; unit check of normalize here
    const m = wa.normalize({
      from: PHONE, timestamp: '1788184271', type: 'text', text: { body: 'hello there' },
    });
    expect(m?.type).toBe('text');
    expect(m?.text).toBe('hello there');
    const loc = wa.normalize({
      from: PHONE, timestamp: '1788184271', type: 'location',
      location: { latitude: 6.5, longitude: 3.4, name: 'Lekki' },
    });
    expect(loc?.location?.lat).toBe(6.5);
  });

  it('stats track conversations, bookings, escalations', async () => {
    await say('I need a taxi from Lekki to Ikeja');
    await say('1');
    expect(wa.stats.bookingsCreated).toBeGreaterThanOrEqual(1);
    expect(wa.stats.conversations).toBeGreaterThanOrEqual(1);
  });
});

describe('WhatsApp AI — document input (OCR path)', () => {
  const doc = { from: '+2348012345111', type: 'document' as const, mediaId: 'doc_901', timestamp: new Date().toISOString() };

  it('unreadable document → guidance reply, no crash', async () => {
    const out = await processInbound(doc as any);
    expect(out.text).toContain('📄');
    expect(out.text.toLowerCase()).toContain('document');
  });

  it('document with OCR text routes like a text message', async () => {
    setMediaPipeline({
      ...mediaPipeline,
      async extractFromDocument(id) { return id === 'doc_902' ? { ocrText: 'Book me a taxi from Lekki to Ikeja', docKind: 'note' } : { ocrText: '' }; },
    });
    const out = await processInbound({ ...doc, mediaId: 'doc_902' } as any);
    expect(out.meta?.intent).toBe('book_transport');
    setMediaPipeline({ async transcribe() { return ''; }, async extractFromImage() { return { ocrText: '', locations: [] }; }, async extractFromDocument() { return { ocrText: '' }; } });
  });
});
