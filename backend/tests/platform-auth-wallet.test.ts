import { describe, expect, it } from 'vitest';
import {
  USER_TYPES, can, signJwt, verifyJwt, RefreshManager, generateTotpSecret,
  totp, verifyTotp, fingerprint, SessionStore, AuditLog, verifyAuditChain,
} from '../libs/auth/src/index';
import { WalletService, WalletError } from '../libs/wallet/src/index';

describe('auth — RBAC for the 15 user types', () => {
  it('defines exactly the 15 platform user types', () => {
    expect(USER_TYPES).toHaveLength(15);
    expect([...USER_TYPES]).toEqual(expect.arrayContaining(['customer', 'driver', 'vendor_owner', 'corporate_admin', 'compliance_officer', 'super_admin']));
  });

  it('enforces least privilege', () => {
    expect(can('customer', 'booking:create')).toBe(true);
    expect(can('customer', 'wallet:audit')).toBe(false);
    expect(can('support', 'users:support')).toBe(true);
    expect(can('support', 'vendor:verify')).toBe(false);
    expect(can('compliance_officer', 'compliance:manage')).toBe(true);
    expect(can('super_admin', 'system:emergency')).toBe(true);
    expect(can('admin', 'system:emergency')).toBe(false);
  });
});

describe('auth — JWT + rotating refresh families', () => {
  const opts = { secret: 'test-secret' };

  it('signs and verifies HS256 tokens with expiry', () => {
    const { token } = signJwt({ sub: 'usr_1', type: 'customer' }, { ...opts, ttlSec: 60 });
    const claims = verifyJwt(token, opts);
    expect(claims.sub).toBe('usr_1');
    expect(claims.type).toBe('customer');
    expect(() => verifyJwt(token, { secret: 'wrong' })).toThrow();
    const expired = signJwt({ sub: 'usr_1', type: 'customer' }, { ...opts, ttlSec: -1, now: () => Date.now() });
    expect(() => verifyJwt(expired.token, opts)).toThrow(/expired/);
  });

  it('refresh tokens are single-use; replay revokes the family', () => {
    const rm = new RefreshManager();
    const r1 = rm.issue('usr_1', opts).refresh;
    const r2 = rm.rotate('usr_1', r1, opts).refresh;
    expect(() => rm.rotate('usr_1', r1, opts)).toThrow(/reuse/);   // replay detected
    expect(() => rm.rotate('usr_1', r2, opts)).toThrow(/revoked/); // family burned
  });
});

describe('auth — TOTP MFA + device fingerprints + sessions + audit', () => {
  it('TOTP verifies within the ±30s window and rejects other codes', () => {
    const secret = generateTotpSecret();
    const code = totp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(code === '000000');
    expect(verifyTotp(secret, code, Date.now() - 5 * 60_000)).toBe(false);   // outside ±window later
  });

  it('unknown devices are untrusted and require MFA challenge; sessions revocable', () => {
    const store = new SessionStore();
    const { session, deviceTrusted } = store.login('usr_2', { deviceId: 'dev_a', userAgent: 'AMSA/1.0 Android', ip: '41.58.0.1' });
    expect(deviceTrusted).toBe(false);                     // new device → challenge
    store.trustDevice('usr_2', fingerprint({ deviceId: 'dev_a', userAgent: 'AMSA/1.0 Android', ip: '41.58.0.1' }));
    const second = store.login('usr_2', { deviceId: 'dev_a', userAgent: 'AMSA/1.0 Android', ip: '41.58.0.1' });
    expect(second.deviceTrusted).toBe(true);
    expect(store.listSessions('usr_2').length).toBe(2);
    store.revokeAll('usr_2');
    expect(store.listSessions('usr_2')).toHaveLength(0);
    void session;
  });

  it('audit log is hash-chained — tampering breaks verification', () => {
    const log = new AuditLog();
    log.record('usr_1', 'login', 'usr_1');
    log.record('admin_1', 'vendor.verify', 'vnd_9');
    const entries = log.list();
    expect(verifyAuditChain(entries)).toBe(true);
    const tampered = [...entries];
    tampered[1] = { ...tampered[1], action: 'wallet.withdraw' };
    expect(verifyAuditChain(tampered)).toBe(false);
  });
});

describe('wallet — double-entry engine', () => {
  it('topup → transfer → withdraw with derived balances', () => {
    const svc = new WalletService();
    const a = svc.open('usr_a');
    const b = svc.open('usr_b');
    svc.topup(a, 5_000_000, 'ref_1');
    expect(svc.balance(a)).toBe(5_000_000);
    svc.transfer(a, b, 1_200_000, 'ref_2');
    expect(svc.balance(a)).toBe(3_800_000);
    expect(svc.balance(b)).toBe(1_200_000);
    svc.withdraw(a, 3_800_000, 'ref_3');
    expect(svc.balance(a)).toBe(0);
  });

  it('rejects overdrafts, duplicate references and frozen wallets', () => {
    const svc = new WalletService();
    const a = svc.open('usr_a');
    svc.topup(a, 1_000_000, 'ref_1');
    expect(() => svc.withdraw(a, 2_000_000, 'ref_2')).toThrow(WalletError);
    expect(() => svc.topup(a, 1_000, 'ref_1')).toThrow(/duplicate/);
    svc.freeze(a);
    expect(() => svc.topup(a, 1_000, 'ref_3')).toThrow(/frozen/);
  });

  it('escrow path: hold → capture pays payee and returns remainder to available', () => {
    const svc = new WalletService();
    const customer = svc.open('cus_1');
    const vendor = svc.open('vnd_1');
    svc.topup(customer, 10_000_000, 'top_1');
    svc.hold(customer, 7_000_000, 'bk_1');
    expect(svc.available(customer)).toBe(3_000_000);      // held funds unavailable
    svc.capture(customer, vendor, 'bk_1', 6_500_000);
    expect(svc.balance(vendor)).toBe(6_500_000);
    expect(svc.available(customer)).toBe(3_500_000);      // 500k remainder released
    expect(svc.statement(customer).holds).toHaveLength(0);
  });
});
