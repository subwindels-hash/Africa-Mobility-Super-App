import { assertTransition } from './booking-state-machine';
import { finalizeFare, splitSettlement, type PricingRule } from './fare-engine';
import {
  createEntry, entryEscrowFund, entryEscrowRelease, entryRefund,
  type JournalEntry,
} from './ledger';
import { money, type Money } from './types';

/**
 * Escrow lifecycle coordinator (docs/07 §3).
 * Owns: state transitions + the journal entries that must accompany them.
 * Every state change is atomic with its money movement or refuses to happen.
 */
export type EscrowState =
  | 'authorized' | 'funded' | 'held' | 'partially_released' | 'released'
  | 'dispute_hold' | 'refunded' | 'partially_refunded' | 'expired';

export interface Milestone {
  label: string;
  pct: number;          // 0..100, sum = 100
  approved?: boolean;
  releasedAmount?: number;
}

export interface EscrowHold {
  id: string;
  bookingId: string;
  customer: string;
  vendor: string;
  total: Money;
  released: number;
  refunded: number;
  state: EscrowState;
  milestones: Milestone[];
  journal: JournalEntry[];
}

export class EscrowError extends Error {
  constructor(msg: string) { super(msg); this.name = 'EscrowError'; }
}

let escrowSeq = 0;

export function openEscrow(p: {
  bookingId: string; customer: string; vendor: string; total: Money; milestones?: Milestone[];
}): EscrowHold {
  if (p.milestones) {
    const sum = p.milestones.reduce((a, m) => a + m.pct, 0);
    if (sum !== 100) throw new EscrowError(`Milestones must total 100%, got ${sum}%`);
  }
  const hold: EscrowHold = {
    id: `esc_${++escrowSeq}`,
    bookingId: p.bookingId,
    customer: p.customer,
    vendor: p.vendor,
    total: p.total,
    released: 0,
    refunded: 0,
    state: 'authorized',
    milestones: p.milestones ?? [],
    journal: [],
  };
  return hold;
}

export function fund(hold: EscrowHold): EscrowHold {
  if (hold.state !== 'authorized') throw new EscrowError(`Cannot fund from ${hold.state}`);
  hold.journal.push(entryEscrowFund({ customer: hold.customer, vendor: hold.vendor }, hold.total, hold.bookingId));
  hold.state = 'funded';
  return hold;
}

export function beginService(hold: EscrowHold): EscrowHold {
  if (hold.state !== 'funded') throw new EscrowError(`Cannot hold from ${hold.state}`);
  hold.state = 'held';
  return hold;
}

/** Completion release (transport/logistics) with settlement split. */
export function releaseOnCompletion(
  hold: EscrowHold,
  bookingStatus: 'completed',
  rule: PricingRule,
  extras?: { extraWaitMinutes?: number; extraStops?: number },
): { hold: EscrowHold; split: ReturnType<typeof splitSettlement> } {
  if (hold.state !== 'held' && hold.state !== 'partially_released') {
    throw new EscrowError(`Cannot release from ${hold.state}`);
  }
  assertTransition(bookingStatus, 'settled'); // booking side must allow settle
  const finalTotal = finalizeFare(hold.total, extras ?? {}, rule);
  const split = splitSettlement(finalTotal, rule.takeRatePct, rule.vatPct);
  hold.journal.push(
    entryEscrowRelease(
      { customer: hold.customer, vendor: hold.vendor },
      split.gross, split.commission, split.vat, split.vendorNet,
      hold.bookingId,
    ),
  );
  hold.released = split.gross.amount;
  hold.state = 'released';
  return { hold, split };
}

/** Milestone tranche release (security retainers, aviation). */
export function releaseMilestone(hold: EscrowHold, milestoneIndex: number, rule: PricingRule): EscrowHold {
  if (hold.state !== 'held' && hold.state !== 'partially_released') {
    throw new EscrowError(`Cannot release milestone from ${hold.state}`);
  }
  const m = hold.milestones[milestoneIndex];
  if (!m) throw new EscrowError(`Milestone ${milestoneIndex} not found`);
  if (m.approved) throw new EscrowError(`Milestone ${milestoneIndex} already approved`);
  const amount = Math.round((hold.total.amount * m.pct) / 100);
  const split = splitSettlement(money(amount, hold.total.currency), rule.takeRatePct, rule.vatPct);
  hold.journal.push(
    entryEscrowRelease(
      { customer: hold.customer, vendor: hold.vendor },
      split.gross, split.commission, split.vat, split.vendorNet,
      `${hold.bookingId}#m${milestoneIndex}`,
    ),
  );
  m.approved = true;
  m.releasedAmount = amount;
  hold.released += amount;
  hold.state = hold.milestones.every((x) => x.approved) ? 'released' : 'partially_released';
  return hold;
}

export function openDispute(hold: EscrowHold): EscrowHold {
  if (!['held', 'partially_released'].includes(hold.state)) {
    throw new EscrowError(`Cannot dispute from ${hold.state}`);
  }
  hold.state = 'dispute_hold';
  return hold;
}

/** Arbitration outcomes: full refund, partial refund, or release remainder to vendor. */
export type DisputeOutcome =
  | { type: 'refund_customer'; amount?: number }
  | { type: 'release_vendor' }
  | { type: 'split'; refundAmount: number };

export function resolveDispute(hold: EscrowHold, outcome: DisputeOutcome, rule: PricingRule): EscrowHold {
  if (hold.state !== 'dispute_hold') throw new EscrowError(`Cannot resolve from ${hold.state}`);
  const remaining = hold.total.amount - hold.released;
  if (outcome.type === 'refund_customer') {
    const amt = Math.min(outcome.amount ?? remaining, remaining);
    hold.journal.push(entryRefund({ customer: hold.customer, vendor: hold.vendor }, money(amt, hold.total.currency), hold.bookingId));
    hold.refunded += amt;
    hold.state = hold.released > 0 && amt < remaining ? 'partially_refunded' : (hold.released > 0 ? 'partially_refunded' : 'refunded');
    if (hold.released === 0 && amt === remaining) hold.state = 'refunded';
    return hold;
  }
  if (outcome.type === 'release_vendor') {
    const amt = remaining;
    const split = splitSettlement(money(amt, hold.total.currency), rule.takeRatePct, rule.vatPct);
    hold.journal.push(entryEscrowRelease({ customer: hold.customer, vendor: hold.vendor }, split.gross, split.commission, split.vat, split.vendorNet, `${hold.bookingId}#dispute`));
    hold.released += amt;
    hold.state = 'released';
    return hold;
  }
  // split
  const refundAmt = Math.min(outcome.refundAmount, remaining);
  hold.journal.push(entryRefund({ customer: hold.customer, vendor: hold.vendor }, money(refundAmt, hold.total.currency), `${hold.bookingId}#dispute-r`));
  const vendorAmt = remaining - refundAmt;
  const split = splitSettlement(money(vendorAmt, hold.total.currency), rule.takeRatePct, rule.vatPct);
  hold.journal.push(entryEscrowRelease({ customer: hold.customer, vendor: hold.vendor }, split.gross, split.commission, split.vat, split.vendorNet, `${hold.bookingId}#dispute-v`));
  hold.refunded += refundAmt;
  hold.released += vendorAmt;
  hold.state = 'partially_refunded';
  return hold;
}

/** Escrow expiry (e.g. vendor never confirmed): full reversal. */
export function expire(hold: EscrowHold): EscrowHold {
  if (hold.state !== 'authorized' && hold.state !== 'funded') {
    throw new EscrowError(`Cannot expire from ${hold.state}`);
  }
  if (hold.state === 'funded') {
    hold.journal.push(entryRefund({ customer: hold.customer, vendor: hold.vendor }, hold.total, `${hold.bookingId}#expire`));
    hold.refunded = hold.total.amount;
    hold.state = 'refunded';
  } else {
    hold.state = 'expired';
  }
  return hold;
}

/** Integrity check used by reconciliation job + tests. */
export function assertEscrowIntegrity(hold: EscrowHold): void {
  for (const e of hold.journal) {
    // throws UnbalancedEntryError if any entry is unbalanced
    createEntry(e.source, e.narration, e.lines, e.sourceRef);
  }
  if (hold.released + hold.refunded > hold.total.amount) {
    throw new EscrowError(`Over-release on ${hold.id}: released ${hold.released} + refunded ${hold.refunded} > total ${hold.total.amount}`);
  }
}
