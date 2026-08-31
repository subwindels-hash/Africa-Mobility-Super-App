import { describe, expect, it } from 'vitest';
import { NotificationService, TEMPLATES } from '../libs/notifications/src/index';
import { MediaService, ASSET_POLICY } from '../libs/media/src/index';
import { GeoService, CircuitBreaker, makeGoogleMaps, makeOsm } from '../libs/geo/src/index';

describe('notifications — templates, preferences, quiet hours, retry', () => {
  it('all templates exist in the five languages', () => {
    for (const t of Object.values(TEMPLATES)) {
      for (const lang of ['en', 'ha', 'yo', 'ig', 'pcm'] as const) expect(t.body[lang].length).toBeGreaterThan(5);
    }
    expect(TEMPLATES.otp.critical).toBe(true);
  });

  it('renders localized templates with variables', () => {
    const ns = new NotificationService();
    expect(ns.render('otp', 'en', { code: '123456' })).toContain('123456');
    expect(ns.render('booking_confirmed', 'pcm', { bookingId: 'BKG-1', service: 'Ride', when: 'now' })).toContain('BKG-1');
    expect(ns.render('shipment_checkpoint', 'ha', { shipmentId: 'shp_1', label: 'Kaduna', eta: '14:00' })).toContain('Kaduna');
  });

  it('quiet hours defer non-critical but never critical alerts', async () => {
    const ns = new NotificationService();
    ns.setPreferences('usr_1', { quietHours: { start: 22, end: 6 } });
    const atNight = new Date('2026-08-31T23:30:00Z');   // 00:30 WAT → inside quiet hours
    const promo = await ns.send({ userId: 'usr_1', to: '+2348010000001', channel: 'sms', template: 'trip_started', at: atNight });
    expect(promo.deferredQuietHours).toBe(true);
    const otp = await ns.send({ userId: 'usr_1', to: '+2348010000001', channel: 'sms', template: 'otp', vars: { code: '123456' }, at: atNight });
    expect(otp.deferredQuietHours).toBe(false);
  });

  it('respects channel opt-outs', async () => {
    const ns = new NotificationService();
    ns.setPreferences('usr_2', { channels: { email: false, fcm: true, sms: true, whatsapp: true, in_app: true } });
    await expect(ns.send({ userId: 'usr_2', to: 'a@b.ng', channel: 'email', template: 'payment_receipt' })).rejects.toThrow(/disabled in user preferences/);
  });

  it('retries failing providers up to 3 attempts', async () => {
    const ns = new NotificationService();
    let calls = 0;
    ns.setProvider('fcm', { send: async () => { calls++; return { delivered: calls >= 3 }; } });   // succeeds on 3rd attempt
    const out = await ns.send({ userId: 'usr_3', to: 'device_9', channel: 'fcm', template: 'security_alert', vars: { detail: 'new login' } });
    expect(out.attempts).toBe(3);
    expect(calls).toBe(3);
  });
});

describe('media — S3 presign, scan verdicts, access, retention', () => {
  it('policy matrix: private KYC/vendor docs, public avatars, scan rules', () => {
    expect(ASSET_POLICY.kyc_documents.acl).toBe('private');
    expect(ASSET_POLICY.vendor_documents.retentionDays).toBe(2555);
    expect(ASSET_POLICY.avatars.acl).toBe('public-read');
    expect(ASSET_POLICY.avatars.scan).toBe(false);
    expect(ASSET_POLICY.cargo_proofs.acl).toBe('platform-read');
  });

  it('presigns per asset class with key structure + expiry, rejects bad files/oversize', () => {
    const ms = new MediaService();
    const up = ms.presign({ assetClass: 'cargo_proofs', uploadedBy: 'vnd_1', filename: 'load_photo.jpg', bytes: 1024 });
    expect(up.objectKey).toMatch(/^cargo_proofs\/vnd_1\//);
    expect(up.url).toContain('amsa-media.s3.amazonaws.com');
    expect(up.acl).toBe('platform-read');
    expect(() => ms.presign({ assetClass: 'avatars', uploadedBy: 'u', filename: 'me.exe', bytes: 1 })).toThrow(/not allowed/);
    expect(() => ms.presign({ assetClass: 'avatars', uploadedBy: 'u', filename: 'me.jpg', bytes: 5 * 1024 * 1024 })).toThrow(/exceeds/);
  });

  it('completion runs the scan verdict and builds image variants', () => {
    const ms = new MediaService();
    const clean = ms.presign({ assetClass: 'cargo_proofs', uploadedBy: 'v', filename: 'proof.png', bytes: 100 });
    expect(ms.complete(clean.uploadId)).toMatchObject({ status: 'clean' });
    expect(ms.get(clean.uploadId)!.variants).toEqual(['original', 'medium', 'thumb']);
    const malware = ms.presign({ assetClass: 'vendor_documents', uploadedBy: 'v', filename: 'invoice_virus.pdf', bytes: 100 });
    expect(ms.complete(malware.uploadId).status).toBe('quarantined');
  });

  it('access control: owner yes, admins yes, strangers only on platform-read', () => {
    const ms = new MediaService();
    const kyc = ms.presign({ assetClass: 'kyc_documents', uploadedBy: 'usr_1', filename: 'id.pdf', bytes: 100 });
    expect(ms.canAccess(kyc.uploadId, { userId: 'usr_1', roles: [] })).toBe(true);
    expect(ms.canAccess(kyc.uploadId, { userId: 'other', roles: [] })).toBe(false);
    expect(ms.canAccess(kyc.uploadId, { userId: 'comp_1', roles: ['compliance'] })).toBe(true);
    const proof = ms.presign({ assetClass: 'cargo_proofs', uploadedBy: 'vnd_1', filename: 'p.jpg', bytes: 100 });
    expect(ms.canAccess(proof.uploadId, { userId: 'cus_1', roles: [] })).toBe(true);      // platform-read
  });

  it('retention sweep deletes expired media, honors -1 (keep forever)', () => {
    const ms = new MediaService();
    const avatar = ms.presign({ assetClass: 'avatars', uploadedBy: 'u', filename: 'me.jpg', bytes: 100 });
    const chat = ms.presign({ assetClass: 'chat_media', uploadedBy: 'u', filename: 'm.jpg', bytes: 100 });
    const get = ms.get(chat.uploadId)!;
    get.createdAt = new Date(Date.now() - 120 * 86_400_000);        // 120 days old
    const sweep = ms.retentionSweep();
    expect(sweep.deleted).toContain(get.objectKey);                 // 90-day policy
    expect(sweep.retained).toContain(avatar.objectKey);             // avatars kept
  });
});

describe('geo — Google primary, OSM backup, circuit breaker, cache', () => {
  it('routes and geocodes through Google by default', () => {
    const geo = new GeoService();
    const g = geo.geocode('Lekki Phase 1');
    expect(g.provider).toBe('google_maps');
    const r = geo.route({ lat: 6.42, lng: 3.45 }, { lat: 6.60, lng: 3.35 });
    expect(r.provider).toBe('google_maps');
    expect(r.distanceKm).toBeGreaterThan(10);
  });

  it('failover to OSM when Google is down — and back after recovery', () => {
    const geo = new GeoService();
    geo.primaryDown = true;
    expect(geo.geocode('Ikeja').provider).toBe('osm');
    geo.primaryDown = false;
    geo.breaker.recordSuccess();
    expect(geo.geocode('Ikoyi').provider).toBe('google_maps');
  });

  it('circuit breaker opens after repeated failures and half-opens after cooldown', () => {
    const cb = new CircuitBreaker(3, 30_000);
    cb.recordFailure(); cb.recordFailure();
    expect(cb.state).toBe('closed');
    cb.recordFailure();
    expect(cb.state).toBe('open');
    expect(cb.allow()).toBe(false);
    expect(cb.allow(new Date(Date.now() + 31_000))).toBe(true);      // half-open probe
    cb.recordSuccess();
    expect(cb.state).toBe('closed');
  });

  it('cache serves repeat geocodes without re-querying', () => {
    const geo = new GeoService();
    const first = geo.geocode('Yaba');
    const second = geo.geocode('Yaba');
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  });

  it('OSM provider returns sane (slightly detoured) routes as backup', () => {
    const osm = makeOsm();
    const google = makeGoogleMaps();
    const from = { lat: 6.5, lng: 3.4 }, to = { lat: 9.1, lng: 7.4 };
    expect(osm.route(from, to).distanceKm).toBeGreaterThan(google.route(from, to).distanceKm);
  });
});
