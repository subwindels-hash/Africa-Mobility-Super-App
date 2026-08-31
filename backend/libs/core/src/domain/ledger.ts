import { money, type Currency, type Money } from './types';

/**
 * Double-entry ledger of record (docs/09 §3, database/schema.sql money.*).
 * Invariant enforced on every entry: Σ(debits) === Σ(credits) per currency.
 * In production this maps 1:1 to money.journal_entries/journal_lines with a
 * deferred trigger asserting balance; this module is the domain test surface.
 */
export type Direction = 'D' | 'C';

export interface JournalLine {
  accountId: string;      // e.g. 'escrow', 'customer:usr_1', 'vendor:vnd_1', 'revenue'
  direction: Direction;
  amount: number;         // minor units
  currency: Currency;
}

export interface JournalEntry {
  id: string;
  source: string;         // e.g. 'escrow.release', 'wallet.fund', 'payout'
  sourceRef?: string;
  narration: string;
  lines: JournalLine[];
  postedAt: Date;
}

export class UnbalancedEntryError extends Error {
  constructor(public readonly entryId: string, debits: number, credits: number) {
    super(`Unbalanced journal entry ${entryId}: D=${debits} C=${credits}`);
    this.name = 'UnbalancedEntryError';
  }
}

let seq = 0;
export function createEntry(
  source: string,
  narration: string,
  lines: JournalLine[],
  sourceRef?: string,
): JournalEntry {
  const id = `je_${++seq}`;
  const byCurrency = new Map<Currency, { d: number; c: number }>();
  for (const l of lines) {
    const agg = byCurrency.get(l.currency) ?? { d: 0, c: 0 };
    if (l.direction === 'D') agg.d += l.amount; else agg.c += l.amount;
    byCurrency.set(l.currency, agg);
  }
  for (const [cur, agg] of byCurrency) {
    if (agg.d !== agg.c) throw new UnbalancedEntryError(id, agg.d, agg.c);
  }
  if (lines.length < 2) throw new Error('Journal entry needs at least 2 lines');
  return { id, source, sourceRef, narration, lines, postedAt: new Date() };
}

/** Account balance = Σ debits − Σ credits (signed; liability/revenue read C−D). */
export function accountBalance(entries: JournalEntry[], accountId: string): Money[] {
  const byCur = new Map<Currency, number>();
  for (const e of entries) {
    for (const l of e.lines) {
      if (l.accountId !== accountId) continue;
      const bal = byCur.get(l.currency) ?? 0;
      byCur.set(l.currency, bal + (l.direction === 'D' ? l.amount : -l.amount));
    }
  }
  // balances are signed views — bypass money() non-negative guard
  return [...byCur.entries()].map(([currency, amount]) => ({ amount, currency }));
}

// ---------------------------------------------------------------------------
// Canonical money flows (used by escrow + wallet services)
// Convention: asset/expense accounts (psp_clearing, payouts_clearing) balance = D−C;
// liability accounts (escrow, wallets owed) and revenue balance = C−D.
// ---------------------------------------------------------------------------

export interface MoneyActors {
  customer: string; vendor: string;
}

/** Customer funds escrow via PSP capture: cash in (asset ↑), escrow liability ↑. */
export function entryEscrowFund(actors: MoneyActors, amount: Money, bookingRef: string): JournalEntry {
  return createEntry(
    'escrow.fund', `Escrow hold for ${bookingRef}`,
    [
      { accountId: 'psp_clearing', direction: 'D', amount: amount.amount, currency: amount.currency },
      { accountId: 'escrow', direction: 'C', amount: amount.amount, currency: amount.currency },
    ],
    bookingRef,
  );
}

/** Escrow release on completion with commission/VAT split (docs/07 §3.2). */
export function entryEscrowRelease(
  actors: MoneyActors,
  gross: Money, commission: Money, vat: Money, vendorNet: Money,
  bookingRef: string,
): JournalEntry {
  return createEntry(
    'escrow.release', `Escrow release for ${bookingRef}`,
    [
      { accountId: 'escrow', direction: 'D', amount: gross.amount, currency: gross.currency },
      { accountId: `vendor:${actors.vendor}`, direction: 'C', amount: vendorNet.amount, currency: vendorNet.currency },
      { accountId: 'revenue_commission', direction: 'C', amount: commission.amount, currency: commission.currency },
      { accountId: 'revenue_tax_payable', direction: 'C', amount: vat.amount, currency: vat.currency },
    ],
    bookingRef,
  );
}

/** Refund: escrow liability ↓, cash returned via PSP. */
export function entryRefund(actors: MoneyActors, amount: Money, bookingRef: string): JournalEntry {
  return createEntry(
    'escrow.refund', `Refund for ${bookingRef}`,
    [
      { accountId: 'escrow', direction: 'D', amount: amount.amount, currency: amount.currency },
      { accountId: 'psp_clearing', direction: 'C', amount: amount.amount, currency: amount.currency },
    ],
    bookingRef,
  );
}

/** Vendor payout to bank: vendor liability ↓, payouts clearing asset ↑. */
export function entryPayout(vendor: string, amount: Money, payoutRef: string): JournalEntry {
  return createEntry(
    'payout', `Bank payout ${payoutRef}`,
    [
      { accountId: `vendor:${vendor}`, direction: 'D', amount: amount.amount, currency: amount.currency },
      { accountId: 'payouts_clearing', direction: 'C', amount: amount.amount, currency: amount.currency },
    ],
    payoutRef,
  );
}
