/**
 * Auth & Identity Service (docs/08 auth-service, docs/17 security).
 * JWT access tokens + rotating refresh families, TOTP MFA, device
 * fingerprinting & trust, sessions, RBAC for the 15 platform user types,
 * and an append-only audit trail. Offline-deterministic — no network.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ── 15 platform user types ──────────────────────────────────────────────────

export const USER_TYPES = [
  'customer', 'rider', 'driver', 'chauffeur', 'vendor_owner', 'vendor_staff',
  'corporate_admin', 'corporate_requester', 'logistics_dispatcher',
  'operations', 'support', 'finance', 'compliance_officer', 'admin', 'super_admin',
] as const;
export type UserType = (typeof USER_TYPES)[number];

export type Permission =
  | 'booking:create' | 'booking:manage:any' | 'wallet:withdraw' | 'wallet:audit'
  | 'vendor:verify' | 'vendor:onboard' | 'dispute:resolve' | 'compliance:manage'
  | 'fams:admin' | 'shield:respond' | 'organism:pulse' | 'reports:financial'
  | 'users:support' | 'users:impersonate' | 'system:emergency';

const ROLE_PERMISSIONS: Record<UserType, Permission[]> = {
  customer: ['booking:create'],
  rider: ['booking:create'],
  driver: ['booking:create'],
  chauffeur: ['booking:create'],
  vendor_owner: ['booking:create', 'vendor:onboard'],
  vendor_staff: ['booking:create'],
  corporate_admin: ['booking:create', 'wallet:withdraw'],
  corporate_requester: ['booking:create'],
  logistics_dispatcher: ['booking:create', 'booking:manage:any'],
  operations: ['booking:manage:any', 'users:support'],
  support: ['users:support'],
  finance: ['wallet:audit', 'wallet:withdraw', 'reports:financial'],
  compliance_officer: ['compliance:manage', 'vendor:verify', 'dispute:resolve'],
  admin: ['booking:manage:any', 'vendor:verify', 'dispute:resolve', 'compliance:manage', 'users:support', 'reports:financial', 'fams:admin'],
  super_admin: ['booking:create', 'booking:manage:any', 'wallet:withdraw', 'wallet:audit', 'vendor:verify', 'vendor:onboard',
    'dispute:resolve', 'compliance:manage', 'fams:admin', 'shield:respond', 'organism:pulse', 'reports:financial',
    'users:support', 'users:impersonate', 'system:emergency'],
};

export function can(userType: UserType, permission: Permission): boolean {
  return ROLE_PERMISSIONS[userType]?.includes(permission) ?? false;
}

export interface Principal { sub: string; type: UserType; scope?: string[]; mfa?: boolean }

// ── JWT (HS256) ─────────────────────────────────────────────────────────────

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export interface JwtOptions { secret: string; ttlSec?: number; refreshTtlSec?: number; now?: () => number }

export function signJwt(p: Principal, opts: JwtOptions): { token: string; expiresInSec: number } {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor((opts.now?.() ?? Date.now()) / 1000);
  const exp = iat + (opts.ttlSec ?? 900);
  const payload = b64u(JSON.stringify({ ...p, iat, exp }));
  const sig = createHmac('sha256', opts.secret).update(`${header}.${payload}`).digest('base64url');
  return { token: `${header}.${payload}.${sig}`, expiresInSec: exp - iat };
}

export function verifyJwt(token: string, opts: JwtOptions): Principal {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) throw new Error('malformed token');
  const expected = createHmac('sha256', opts.secret).update(`${header}.${payload}`).digest('base64url');
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('invalid signature');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Principal & { exp: number };
  if (claims.exp * 1000 < (opts.now?.() ?? Date.now())) throw new Error('token expired');
  return claims;
}

// ── Refresh rotation with reuse detection ──────────────────────────────────

interface RefreshFamily { userId: string; current: string; rotated: string[]; revoked: boolean }

export class RefreshManager {
  private families = new Map<string, RefreshFamily>();

  issue(userId: string, opts: { secret: string }): { refresh: string } {
    const refresh = createHmac('sha256', opts.secret).update(`${userId}:${randomBytes(24).toString('hex')}`).digest('base64url');
    this.families.set(userId, { userId, current: refresh, rotated: [], revoked: false });
    return { refresh };
  }

  /** Rotate: single-use; replaying a rotated token revokes the whole family. */
  rotate(userId: string, refresh: string, opts: { secret: string }): { refresh: string } {
    const f = this.families.get(userId);
    if (!f) throw new Error('no refresh family');
    if (f.revoked) throw new Error('refresh family revoked');
    if (f.rotated.includes(refresh)) { f.revoked = true; throw new Error('refresh reuse detected — family revoked'); }
    if (refresh !== f.current) throw new Error('unknown refresh token');
    const next = createHmac('sha256', opts.secret).update(`${userId}:rotate:${randomBytes(24).toString('hex')}`).digest('base64url');
    f.rotated.push(refresh);
    f.current = next;
    return { refresh: next };
  }

  revoke(userId: string): void { const f = this.families.get(userId); if (f) f.revoked = true; }
}

// ── TOTP MFA (RFC 6238, 30s step, ±1 window) ───────────────────────────────

export function generateTotpSecret(): string { return randomBytes(20).toString('base64url'); }

export function totp(secret: string, step = 30, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', Buffer.from(secret, 'utf8')).update(buf).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  for (const drift of [-1, 0, 1]) {
    if (totp(secret, 30, at + drift * 30_000) === code) return true;
  }
  return false;
}

// ── Device fingerprints & sessions ──────────────────────────────────────────

export interface DeviceRecord { fingerprint: string; trusted: boolean; firstSeen: Date; lastSeen: Date }
export interface SessionRecord { id: string; userId: string; device: string; ip: string; createdAt: Date; lastSeenAt: Date; revokedAt?: Date }

export function fingerprint(parts: { deviceId: string; userAgent: string; ip: string }): string {
  return createHmac('sha256', 'amsa-device').update(`${parts.deviceId}|${parts.userAgent}|${parts.ip}`).digest('base64url').slice(0, 22);
}

export class SessionStore {
  private devices = new Map<string, Map<string, DeviceRecord>>();   // userId → fp → device
  private sessions = new Map<string, SessionRecord>();
  private seq = 0;

  /** Returns trust decision — unknown devices must be challenged (MFA). */
  login(userId: string, parts: { deviceId: string; userAgent: string; ip: string }): { session: SessionRecord; deviceTrusted: boolean } {
    const fp = fingerprint(parts);
    const userDevices = this.devices.get(userId) ?? new Map<string, DeviceRecord>();
    const known = userDevices.get(fp);
    const rec: DeviceRecord = known
      ? { ...known, lastSeen: new Date() }
      : { fingerprint: fp, trusted: false, firstSeen: new Date(), lastSeen: new Date() };
    userDevices.set(fp, rec);
    this.devices.set(userId, userDevices);
    const session: SessionRecord = { id: `ses_${++this.seq}`, userId, device: fp, ip: parts.ip, createdAt: new Date(), lastSeenAt: new Date() };
    this.sessions.set(session.id, session);
    return { session, deviceTrusted: rec.trusted };
  }

  trustDevice(userId: string, fp: string): void {
    const d = this.devices.get(userId)?.get(fp);
    if (d) d.trusted = true;
  }

  listSessions(userId: string): SessionRecord[] { return [...this.sessions.values()].filter((s) => s.userId === userId && !s.revokedAt); }
  revoke(sessionId: string): void { const s = this.sessions.get(sessionId); if (s) s.revokedAt = new Date(); }
  revokeAll(userId: string): void { for (const s of this.sessions.values()) if (s.userId === userId) s.revokedAt = new Date(); }
}

// ── Audit trail (hash-chained, append-only) ─────────────────────────────────

export interface AuditEntry { seq: number; at: Date; actor: string; action: string; subject?: string; meta?: Record<string, unknown>; prevHash: string; hash: string }

export class AuditLog {
  private entries: AuditEntry[] = [];
  private lastHash = 'genesis';

  record(actor: string, action: string, subject?: string, meta?: Record<string, unknown>): AuditEntry {
    const seq = this.entries.length + 1;
    const at = new Date();
    const payload = `${seq}|${at.toISOString()}|${actor}|${action}|${subject ?? ''}|${JSON.stringify(meta ?? {})}|${this.lastHash}`;
    const hash = createHmac('sha256', 'amsa-audit').update(payload).digest('base64url');
    const entry: AuditEntry = { seq, at, actor, action, subject, meta, prevHash: this.lastHash, hash };
    this.lastHash = hash;
    this.entries.push(entry);
    return entry;
  }

  list(filter?: { actor?: string; subject?: string; action?: string }): AuditEntry[] {
    return this.entries
      .filter((e) => !filter?.actor || e.actor === filter.actor)
      .filter((e) => !filter?.subject || e.subject === filter.subject)
      .filter((e) => !filter?.action || e.action === filter.action);
  }
}

/** Verify the chain — any tampering breaks verification. */
export function verifyAuditChain(entries: AuditEntry[]): boolean {
  let prev = 'genesis';
  for (const e of entries) {
    const payload = `${e.seq}|${e.at.toISOString()}|${e.actor}|${e.action}|${e.subject ?? ''}|${JSON.stringify(e.meta ?? {})}|${prev}`;
    if (createHmac('sha256', 'amsa-audit').update(payload).digest('base64url') !== e.hash) return false;
    prev = e.hash;
  }
  return true;
}
