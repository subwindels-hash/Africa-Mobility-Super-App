/**
 * Compliance Service (docs/17 security, docs/23 financials).
 * KYC cases (BVN/NIN + address + liveness), AML screening (sanctions / PEP /
 * adverse media) with risk scoring, GDPR + NDPR data-subject requests with
 * retention exceptions, and the PCI DSS 12-requirement evidence tracker.
 */
// ── KYC ─────────────────────────────────────────────────────────────────────

export type KycState = 'initiated' | 'identity_verified' | 'address_verified' | 'liveness_passed' | 'approved' | 'rejected';
export interface KycCase { id: string; userId: string; state: KycState; bvnMasked: string; ninMasked: string; address?: string; at: Date }

/** Deterministic BVN/NIN check: digits summing to a multiple of 7 → verified. */
export function idNumberValid(idNumber: string): boolean {
  if (!/^\d{11}$/.test(idNumber)) return false;
  return [...idNumber].reduce((a, d) => a + Number(d), 0) % 7 === 0;
}

export class KycService {
  private cases = new Map<string, KycCase>();
  private seq = 0;

  initiate(userId: string, bvn: string, nin: string): KycCase {
    const c: KycCase = { id: `kyc_${++this.seq}`, userId, state: 'initiated', bvnMasked: `***${bvn.slice(-3)}`, ninMasked: `***${nin.slice(-3)}`, at: new Date() };
    if (idNumberValid(bvn) && idNumberValid(nin)) c.state = 'identity_verified';
    else c.state = 'rejected';
    this.cases.set(c.id, c);
    return c;
  }

  verifyAddress(id: string, address: string): KycCase {
    const c = this.cases.get(id)!;
    this.expect(c, 'identity_verified');
    c.address = address;
    c.state = 'address_verified';
    return c;
  }

  liveness(id: string, passed: boolean): KycCase {
    const c = this.cases.get(id)!;
    this.expect(c, 'address_verified');
    c.state = passed ? 'liveness_passed' : 'rejected';
    return c;
  }

  approve(id: string): KycCase {
    const c = this.cases.get(id)!;
    this.expect(c, 'liveness_passed');
    c.state = 'approved';
    return c;
  }

  byUser(userId: string): KycCase | undefined { return [...this.cases.values()].find((c) => c.userId === userId); }
  private expect(c: KycCase, s: KycState) { if (c.state !== s) throw new Error(`kyc flow violation — at ${c.state}, expected ${s}`); }
}

// ── AML screening ───────────────────────────────────────────────────────────

export interface ScreenResult { userId: string; hit: boolean; lists: string[]; riskScore: number; sar: boolean; at: Date }

const SANCTIONS = ['abacha junior', 'musa bello sanctioned', 'vladimir greylist'];
const PEP = ['governor adebayo', 'senator okonkwo', 'hon. danjuma'];
const ADVERSE = ['convicted fraud', '419 ring leader'];

export function screen(name: string, transactionCount = 0, largeCashMinor = 0): ScreenResult {
  const n = name.toLowerCase();
  const lists: string[] = [];
  if (SANCTIONS.some((s) => n.includes(s.split(' ')[0]) && n.includes(s.split(' ').slice(-1)[0]))) lists.push('sanctions');
  if (PEP.some((p) => n.includes(p.split(' ')[1] ?? ''))) lists.push('pep');
  if (ADVERSE.some((a) => n.includes(a.split(' ')[0]))) lists.push('adverse_media');
  let risk = lists.length * 30;
  if (transactionCount > 50) risk += 30;             // velocity
  if (largeCashMinor > 100_000_000) risk += 30;      // ₦1M+ cash (structuring hint)
  const sar = risk >= 60;
  return { userId: name, hit: lists.length > 0, lists, riskScore: Math.min(100, risk), sar, at: new Date() };
}

// ── GDPR / NDPR data-subject requests ───────────────────────────────────────

export type SubjectRequestType = 'access' | 'erasure' | 'portability' | 'correction' | 'objection';
export interface SubjectRequest { id: string; userId: string; type: SubjectRequestType; state: 'received' | 'verified' | 'fulfilled' | 'rejected'; receivedAt: Date; dueAt: Date; fulfillment?: { exportManifest?: string[]; erased?: string[]; retained?: { system: string; legalBasis: string }[] } }

const RETENTION_EXCEPTIONS: Record<string, string> = {
  'wallet.transactions': 'financial records — 6y (FATF/CTR)',
  'ledger.transactions': 'financial records — 6y (FATF/CTR)',
  'escrow.holds': 'financial records — 6y',
  'identity.kyc': 'identity verification — 5y (NDPR Art. 28)',
  'disputes.cases': 'legal hold — statute of limitations',
};

export class PrivacyService {
  private requests = new Map<string, SubjectRequest>();
  private seq = 0;
  private consent = new Map<string, { marketing: boolean; analytics: boolean; at: Date }>();

  request(userId: string, type: SubjectRequestType): SubjectRequest {
    const r: SubjectRequest = { id: `dsr_${++this.seq}`, userId, type, state: 'received', receivedAt: new Date(), dueAt: new Date(Date.now() + 30 * 24 * 3600_000) };
    this.requests.set(r.id, r);
    return r;
  }

  verify(id: string): SubjectRequest { const r = this.requests.get(id)!; r.state = 'verified'; return r; }

  /** Access/portability → manifest of stored systems; erasure → per-system actions with retention exceptions. */
  fulfill(id: string, systems: string[]): SubjectRequest {
    const r = this.requests.get(id)!;
    if (r.type === 'access' || r.type === 'portability' || r.type === 'correction') {
      r.fulfillment = { exportManifest: systems };
    } else {
      const erased = systems.filter((s) => !RETENTION_EXCEPTIONS[s]);
      const retained = systems.filter((s) => RETENTION_EXCEPTIONS[s]).map((s) => ({ system: s, legalBasis: RETENTION_EXCEPTIONS[s] }));
      r.fulfillment = { erased, retained };
    }
    r.state = 'fulfilled';
    return r;
  }

  setConsent(userId: string, c: { marketing: boolean; analytics: boolean }) { this.consent.set(userId, { ...c, at: new Date() }); }
  consentFor(userId: string) { return this.consent.get(userId); }
  listRequests(userId?: string) { return [...this.requests.values()].filter((r) => !userId || r.userId === userId); }
}

// ── PCI DSS readiness (12 requirements) ─────────────────────────────────────

export interface PciControl { req: string; title: string; status: 'compliant' | 'in_progress' | 'gap'; evidence: string[]; lastReviewedAt: Date }

export const PCI_REQUIREMENTS: { req: string; title: string }[] = [
  { req: '1', title: 'Network security controls (firewalls)' },
  { req: '2', title: 'Secure configurations' },
  { req: '3', title: 'Protect stored account data' },
  { req: '4', title: 'Encrypt transmission of cardholder data' },
  { req: '5', title: 'Protect against malicious software' },
  { req: '6', title: 'Develop and maintain secure systems' },
  { req: '7', title: 'Restrict access by business need-to-know' },
  { req: '8', title: 'Identify users and authenticate access' },
  { req: '9', title: 'Restrict physical access' },
  { req: '10', title: 'Log and monitor all access' },
  { req: '11', title: 'Test security of systems regularly' },
  { req: '12', title: 'Support information security policies' },
];

export class PciTracker {
  private controls: PciControl[] = PCI_REQUIREMENTS.map((r) => ({ ...r, status: 'gap' as const, evidence: [], lastReviewedAt: new Date() }));

  setStatus(req: string, status: PciControl['status'], evidence?: string): PciControl {
    const c = this.controls.find((x) => x.req === req);
    if (!c) throw new Error(`unknown PCI requirement ${req}`);
    c.status = status;
    if (evidence) c.evidence.push(evidence);
    c.lastReviewedAt = new Date();
    return c;
  }

  readiness(): { compliant: number; total: number; readyPct: number; gaps: string[] } {
    const compliant = this.controls.filter((c) => c.status === 'compliant').length;
    return {
      compliant, total: this.controls.length,
      readyPct: Math.round((compliant / this.controls.length) * 100),
      gaps: this.controls.filter((c) => c.status !== 'compliant').map((c) => `req ${c.req} — ${c.title}`),
    };
  }
}
