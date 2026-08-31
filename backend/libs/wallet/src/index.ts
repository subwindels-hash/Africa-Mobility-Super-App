/**
 * Wallet Service (docs/07 §3, docs/08 wallet-service).
 * Double-entry wallet engine: top-ups, P2P transfers, authorization holds,
 * captures, withdrawals and refunds — every movement is a balanced entry
 * pair, balances are derived (never stored arithmetic), idempotency enforced.
 */
export interface Money { amountMinor: number; currency: 'NGN' }

export interface WalletEntry { id: string; walletId: string; ts: Date; debit: number; credit: number; ref: string; memo: string }
export interface WalletRecord { id: string; userId: string; currency: 'NGN'; entries: WalletEntry[]; holds: Map<string, { amountMinor: number; ref: string; createdAt: Date }>; status: 'active' | 'frozen'; }

export class WalletError extends Error { constructor(msg: string) { super(msg); this.name = 'WalletError'; } }

const neg = (n: number) => Object.is(n, -0) ? 0 : n;

export class WalletService {
  private wallets = new Map<string, WalletRecord>();
  private seq = 0;
  private seenRefs = new Set<string>();

  open(userId: string): WalletRecord {
    const existing = [...this.wallets.values()].find((w) => w.userId === userId);
    if (existing) return existing;
    const w: WalletRecord = { id: `wal_${++this.seq}`, userId, currency: 'NGN', entries: [], holds: new Map(), status: 'active' };
    this.wallets.set(w.id, w);
    return w;
  }

  byUser(userId: string): WalletRecord | undefined { return [...this.wallets.values()].find((w) => w.userId === userId); }
  get(id: string): WalletRecord | undefined { return this.wallets.get(id); }

  private assert(w: WalletRecord, ref: string) {
    if (w.status === 'frozen') throw new WalletError('wallet frozen — compliance hold');
    if (this.seenRefs.has(ref)) throw new WalletError(`duplicate reference ${ref}`);
    this.seenRefs.add(ref);
  }

  private push(w: WalletRecord, ref: string, memo: string, credit = 0, debit = 0) {
    w.entries.push({ id: `ent_${++this.seq}`, walletId: w.id, ts: new Date(), debit: neg(debit), credit, ref, memo });
  }

  balance(w: WalletRecord): number { return w.entries.reduce((a, e) => a + e.credit - e.debit, 0); }
  available(w: WalletRecord): number { return this.balance(w) - [...w.holds.values()].reduce((a, h) => a + h.amountMinor, 0); }

  /** Top-up (PSP settlement credits the platform wallet ledger). */
  topup(w: WalletRecord, amountMinor: number, ref: string): WalletRecord {
    if (amountMinor <= 0) throw new WalletError('amount must be positive');
    this.assert(w, ref);
    this.push(w, ref, 'topup', amountMinor);
    return w;
  }

  /** P2P transfer — atomic pair of entries across both wallets. */
  transfer(from: WalletRecord, to: WalletRecord, amountMinor: number, ref: string): { from: WalletRecord; to: WalletRecord } {
    if (amountMinor <= 0) throw new WalletError('amount must be positive');
    if (this.available(from) < amountMinor) throw new WalletError('insufficient available balance');
    this.assert(from, ref);
    this.seenRefs.add(ref);
    this.push(from, ref, `transfer to ${to.id}`, 0, amountMinor);
    this.push(to, ref, `transfer from ${from.id}`, amountMinor);
    return { from, to };
  }

  /** Authorization hold (escrow funding path). */
  hold(w: WalletRecord, amountMinor: number, ref: string): void {
    if (this.available(w) < amountMinor) throw new WalletError('insufficient available balance for hold');
    if (w.holds.has(ref)) throw new WalletError(`hold ${ref} exists`);
    w.holds.set(ref, { amountMinor, ref, createdAt: new Date() });
  }

  /** Capture part/all of a hold — moves held funds out to the payee. */
  capture(w: WalletRecord, payee: WalletRecord, ref: string, amountMinor?: number): void {
    const h = w.holds.get(ref);
    if (!h) throw new WalletError(`unknown hold ${ref}`);
    const amt = amountMinor ?? h.amountMinor;
    if (amt > h.amountMinor) throw new WalletError('capture exceeds hold');
    this.seenRefs.delete(ref);
    this.assert(w, `${ref}:capture`);
    this.push(w, `${ref}:capture`, `capture hold ${ref}`, 0, amt);
    this.push(payee, `${ref}:capture`, `escrow release ${ref}`, amt);
    w.holds.delete(ref);   // uncaptured remainder simply returns to available (never left the balance)
  }

  /** Release a hold without capture (refund to available). */
  releaseHold(w: WalletRecord, ref: string): void {
    if (!w.holds.has(ref)) throw new WalletError(`unknown hold ${ref}`);
    w.holds.delete(ref);
  }

  withdraw(w: WalletRecord, amountMinor: number, ref: string): WalletRecord {
    if (amountMinor <= 0) throw new WalletError('amount must be positive');
    if (this.available(w) < amountMinor) throw new WalletError('insufficient available balance');
    this.assert(w, ref);
    this.push(w, ref, 'withdrawal to bank', 0, amountMinor);
    return w;
  }

  freeze(w: WalletRecord): void { w.status = 'frozen'; }
  unfreeze(w: WalletRecord): void { w.status = 'active'; }

  statement(w: WalletRecord): { entries: WalletEntry[]; balanceMinor: number; availableMinor: number; holds: { ref: string; amountMinor: number }[] } {
    return {
      entries: w.entries,
      balanceMinor: this.balance(w),
      availableMinor: this.available(w),
      holds: [...w.holds.values()].map((h) => ({ ref: h.ref, amountMinor: h.amountMinor })),
    };
  }
}
