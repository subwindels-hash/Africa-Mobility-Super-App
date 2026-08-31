/**
 * Zero Trust Security Framework — least privilege, continuous verification,
 * device trust scoring, risk-based authentication, micro-segmentation and
 * adaptive access controls for every request in the ecosystem.
 */

export type PrincipalRole =
  | 'customer' | 'driver' | 'dispatch_rider' | 'vendor' | 'fleet_owner' | 'travel_agent'
  | 'hotel_partner' | 'security_provider' | 'jet_operator' | 'helicopter_operator'
  | 'boat_operator' | 'corporate_client' | 'support_agent' | 'admin' | 'super_admin';

/** Least-privilege capability map (resource prefix → roles allowed). */
export const CAPABILITIES: Record<string, PrincipalRole[]> = {
  'booking.create': ['customer', 'corporate_client', 'admin', 'super_admin'],
  'booking.read.own': ['customer', 'driver', 'dispatch_rider', 'corporate_client', 'vendor', 'admin', 'super_admin'],
  'wallet.move': ['customer', 'corporate_client', 'admin', 'super_admin'],
  'wallet.read.own': ['customer', 'driver', 'dispatch_rider', 'vendor', 'corporate_client', 'admin', 'super_admin'],
  'escrow.release': ['admin', 'super_admin'],
  'vendor.manage': ['vendor', 'fleet_owner', 'travel_agent', 'hotel_partner', 'security_provider', 'jet_operator', 'helicopter_operator', 'boat_operator', 'admin', 'super_admin'],
  'fams.admin': ['super_admin'],
  'shield.soc': ['admin', 'super_admin'],
  'shield.approve': ['super_admin'],
  'customers.export': ['admin', 'super_admin'],
  'audit.read': ['admin', 'super_admin'],
};

export interface AccessRequest {
  principal: string;
  role: PrincipalRole;
  capability: string;                // e.g. 'escrow.release'
  deviceId?: string;
  deviceTrust?: number;              // 0-100 (from deviceTrustScore)
  ip?: string;
  sessionAgeMin?: number;
  mfaDone?: boolean;
  riskScore?: number;                // live threat risk for this principal (0-100)
}

export type AccessDecision = 'allow' | 'step_up_mfa' | 'allow_read_only' | 'deny';

export interface AccessResult {
  decision: AccessDecision;
  reasons: string[];
  trustScore: number;                // effective composite trust 0-100
  verification: 'continuous';        // zero trust re-verifies every request
}

/** Micro-segmentation: which service tiers may talk to each other. */
const SEGMENTS: Record<string, string[]> = {
  edge: ['api-gateway', 'cdn', 'waf'],
  app: ['booking-svc', 'matching-svc', 'pricing-svc', 'whatsapp-ai', 'search-svc'],
  money: ['wallet-svc', 'escrow-svc', 'payment-svc', 'ledger-svc'],
  data: ['postgres', 'redis', 's3', 'analytics'],
  admin: ['admin-web', 'fams-svc', 'shield-soc'],
};
const SEGMENT_POLICY: Record<string, string[]> = {
  edge: ['app', 'admin'],
  app: ['money', 'data', 'app'],
  money: ['data', 'money'],
  data: [],
  admin: ['app', 'money', 'data', 'admin'],
};

export class ZeroTrustEngine {
  private deviceHistory = new Map<string, { firstSeen: number; incidents: number; distinctPrincipals: Set<string>; mfaSeen: boolean }>();
  private decisions: AccessResult[] = [];

  /** Device trust scoring — age, incident history, principal sharing, MFA use. */
  deviceTrustScore(deviceId: string, opts?: { incident?: boolean; principal?: string; mfa?: boolean }): number {
    const d = this.deviceHistory.get(deviceId) ?? { firstSeen: Date.now(), incidents: 0, distinctPrincipals: new Set<string>(), mfaSeen: false };
    if (opts?.incident) d.incidents++;
    if (opts?.principal) d.distinctPrincipals.add(opts.principal);
    if (opts?.mfa) d.mfaSeen = true;
    this.deviceHistory.set(deviceId, d);

    const ageDays = (Date.now() - d.firstSeen) / 86_400_000;
    let score = 45 + Math.min(25, ageDays * 2);          // tenure
    score -= d.incidents * 15;                            // incidents
    score -= Math.max(0, d.distinctPrincipals.size - 1) * 20; // account sharing
    if (d.mfaSeen) score += 10;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /** Continuous verification — every access request is re-evaluated. */
  decide(req: AccessRequest): AccessResult {
    const reasons: string[] = [];
    const allowed = CAPABILITIES[req.capability] ?? ['super_admin'];

    if (!allowed.includes(req.role)) {
      const r: AccessResult = { decision: 'deny', reasons: [`least privilege: ${req.role} lacks ${req.capability}`], trustScore: 0, verification: 'continuous' };
      this.decisions.push(r);
      return r;
    }

    const deviceTrust = req.deviceTrust ?? (req.deviceId ? this.deviceTrustScore(req.deviceId) : 50);
    const risk = req.riskScore ?? 0;
    let trust = deviceTrust;
    if (req.mfaDone) trust += 10;
    if (risk > 0) trust -= Math.min(60, risk * 0.8);
    trust = Math.max(0, Math.min(100, Math.round(trust)));

    // adaptive access control
    let decision: AccessDecision = 'allow';
    const sensitive = req.capability.startsWith('escrow') || req.capability.startsWith('fams') || req.capability === 'customers.export' || req.capability.startsWith('shield.approve');
    if (risk >= 70) { decision = 'deny'; reasons.push(`live risk ${risk}/100 above deny threshold`); }
    else if (risk >= 40 || trust < 35 || (sensitive && !req.mfaDone)) { decision = 'step_up_mfa'; reasons.push(risk >= 40 ? `risk ${risk}` : trust < 35 ? `device trust ${trust}` : `${req.capability} requires MFA`); }
    else if (trust < 55 && sensitive) { decision = 'allow_read_only'; reasons.push(`low trust (${trust}) — read-only until verified`); }
    else reasons.push(`trust ${trust}, role ok, risk ${risk}`);

    const r: AccessResult = { decision, reasons, trustScore: trust, verification: 'continuous' };
    this.decisions.push(r);
    return r;
  }

  /** Micro-segmentation check — can service A reach service B? */
  canTalk(from: string, to: string): boolean {
    const segOf = (s: string) => Object.entries(SEGMENTS).find(([, list]) => list.includes(s))?.[0];
    const a = segOf(from), b = segOf(to);
    if (!a || !b) return false;
    return a === b ? true : (SEGMENT_POLICY[a] ?? []).includes(b);
  }

  recentDecisions(): AccessResult[] { return this.decisions.slice(-50); }
}
