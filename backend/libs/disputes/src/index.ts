/**
 * Disputes & Arbitration Service (docs/07 §escrow workflows).
 * Case lifecycle (open → acknowledged → under_review → resolved/escalated),
 * evidence handling with SLA timers, arbitration outcomes wired to escrow
 * (refund_customer / release_vendor / split), appeals and PSP chargebacks.
 */
export type DisputeSubject = 'booking' | 'shipment' | 'payment' | 'vendor_conduct';
export type DisputeReason = 'service_not_delivered' | 'late_delivery' | 'damaged_goods' | 'overcharge' | 'driver_conduct' | 'item_missing' | 'fraud_suspected' | 'other';
export type DisputeState = 'open' | 'acknowledged' | 'under_review' | 'resolved' | 'escalated' | 'closed';
export type Resolution = { type: 'refund_customer'; amountMinor: number } | { type: 'release_vendor' } | { type: 'split'; customerMinor: number; vendorMinor: number } | { type: 'reject' };

export interface Evidence { id: string; by: string; kind: 'photo' | 'chat_log' | 'document' | 'gps_log' | 'recording'; ref: string; at: Date }
export interface DisputeCase {
  id: string;                     // dsp_
  subject: DisputeSubject;
  subjectRef: string;             // booking/shipment/payment id
  reason: DisputeReason;
  openedBy: string;               // customer id
  againstVendor: string;
  amountInPlayMinor: number;
  state: DisputeState;
  evidence: Evidence[];
  assignedTo?: string;            // arbitration officer
  resolution?: Resolution;
  appeal?: { by: string; at: Date; note: string };
  chargeback?: { psp: string; feeMinor: number; at: Date };
  slaDueAt: Date;
  createdAt: Date;
}

export const SLA_HOURS = { acknowledge: 4, review: 24, resolve: 72 };

export interface EscrowDisputeHooks {
  refundCustomer(subjectRef: string, amountMinor: number): void;
  releaseVendor(subjectRef: string, amountMinor: number): void;
}

export class DisputeService {
  private cases = new Map<string, DisputeCase>();
  private seq = 0;

  constructor(private hooks?: EscrowDisputeHooks) {}

  open(p: { subject: DisputeSubject; subjectRef: string; reason: DisputeReason; openedBy: string; againstVendor: string; amountInPlayMinor: number; evidence?: Omit<Evidence, 'id' | 'at'>[] }): DisputeCase {
    const c: DisputeCase = {
      id: `dsp_${++this.seq}`, subject: p.subject, subjectRef: p.subjectRef, reason: p.reason,
      openedBy: p.openedBy, againstVendor: p.againstVendor, amountInPlayMinor: p.amountInPlayMinor,
      state: 'open', evidence: [],
      slaDueAt: new Date(Date.now() + SLA_HOURS.resolve * 3600_000), createdAt: new Date(),
    };
    for (const e of p.evidence ?? []) c.evidence.push({ ...e, id: `evd_${c.id}_${c.evidence.length + 1}`, at: new Date() });
    this.cases.set(c.id, c);
    return c;
  }

  get(id: string): DisputeCase { return this.cases.get(id)!; }
  list(filter?: { state?: DisputeState; vendor?: string; openedBy?: string }): DisputeCase[] {
    return [...this.cases.values()]
      .filter((c) => !filter?.state || c.state === filter.state)
      .filter((c) => !filter?.vendor || c.againstVendor === filter.vendor)
      .filter((c) => !filter?.openedBy || c.openedBy === filter.openedBy);
  }

  addEvidence(id: string, e: Omit<Evidence, 'id' | 'at'>): Evidence {
    const c = this.get(id);
    const ev: Evidence = { ...e, id: `evd_${id}_${c.evidence.length + 1}`, at: new Date() };
    c.evidence.push(ev);
    return ev;
  }

  acknowledge(id: string, officer: string): DisputeCase {
    const c = this.get(id);
    this.assertState(c, 'open');
    c.state = 'acknowledged'; c.assignedTo = officer;
    return c;
  }

  review(id: string): DisputeCase {
    const c = this.get(id);
    this.assertState(c, 'acknowledged');
    c.state = 'under_review';
    return c;
  }

  /** Arbitration outcome — executes escrow movements atomically with the decision. */
  resolve(id: string, resolution: Resolution, by: string): DisputeCase {
    const c = this.get(id);
    if (c.state !== 'under_review' && c.state !== 'escalated') throw new Error(`cannot resolve from ${c.state}`);
    if (resolution.type === 'refund_customer' && resolution.amountMinor > c.amountInPlayMinor) throw new Error('refund exceeds amount in play');
    if (resolution.type === 'split' && resolution.customerMinor + resolution.vendorMinor > c.amountInPlayMinor) throw new Error('split exceeds amount in play');
    c.state = 'resolved';
    c.resolution = resolution;
    c.assignedTo = by;
    if (resolution.type === 'refund_customer') this.hooks?.refundCustomer(c.subjectRef, resolution.amountMinor);
    if (resolution.type === 'release_vendor') this.hooks?.releaseVendor(c.subjectRef, c.amountInPlayMinor);
    if (resolution.type === 'split') {
      this.hooks?.refundCustomer(c.subjectRef, resolution.customerMinor);
      this.hooks?.releaseVendor(c.subjectRef, resolution.vendorMinor);
    }
    return c;
  }

  escalate(id: string): DisputeCase { const c = this.get(id); this.assertState(c, 'under_review'); c.state = 'escalated'; return c; }

  appeal(id: string, by: string, note: string): DisputeCase {
    const c = this.get(id);
    if (c.appeal) throw new Error('appeal already filed');
    if (c.state !== 'resolved') throw new Error('appeals only after resolution');
    c.appeal = { by, at: new Date(), note };
    c.state = 'escalated';
    return c;
  }

  /** PSP chargeback — re-opens and records fee; representation evidence attaches. */
  chargeback(id: string, psp: string, feeMinor: number): DisputeCase {
    const c = this.get(id);
    if (!c) throw new Error('unknown case');
    c.chargeback = { psp, feeMinor, at: new Date() };
    c.state = 'escalated';
    return c;
  }

  slaBreached(id: string, now = new Date()): boolean { const c = this.get(id); return c.state !== 'resolved' && c.state !== 'closed' && now > c.slaDueAt; }

  private assertState(c: DisputeCase, expected: DisputeState) { if (c.state !== expected) throw new Error(`expected ${expected}, got ${c.state}`); }
}
