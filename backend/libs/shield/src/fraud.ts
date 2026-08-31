/**
 * Fraud Detection & Trust Swarm — dedicated agents watching bookings, wallet,
 * escrow, corporate, refunds, promotions and identity across the platform.
 * (Complements the matching engine's per-booking fraudRisk hard filter.)
 */

export interface FraudSignal {
  id?: string;
  ts?: Date;
  kind: 'booking' | 'wallet' | 'escrow' | 'refund' | 'promo' | 'vendor' | 'account';
  principal: string;              // customer/vendor id
  amountMinor?: number;
  city?: string;
  deviceId?: string;
  meta?: Record<string, unknown>;
}

export interface FraudAlert {
  id: string;
  ts: Date;
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  score: number;                  // 0-100 trust damage
  principal: string;
  evidence: string[];
  recommendedActions: string[];    // autonomous-response inputs
}

interface PrincipalProfile {
  bookings: { ts: number; amount: number; city?: string; passengers?: number }[];
  walletFunds: { ts: number; amount: number }[];
  withdrawals: { ts: number; amount: number }[];
  refunds: { ts: number }[];
  bookingsTotal: number;
  promosByDevice: number;
  disputesAfterCompletion: number;
  devicesSeen: string[];
  credentialChangeAt?: number;
}

const WINDOW = 60 * 60 * 1000; // 1h velocity windows

export class FraudSwarm {
  private profiles = new Map<string, PrincipalProfile>();
  private deviceAccounts = new Map<string, Set<string>>();
  private alerts: FraudAlert[] = [];
  private seq = 0;

  /** Assess one activity signal → zero or one fraud alert. */
  assess(s: FraudSignal): FraudAlert | null {
    const ts = s.ts ?? new Date();
    const now = ts.getTime();
    const p = this.profiles.get(s.principal) ?? this.fresh();

    const track = (list: { ts: number }[]) => list.filter((x) => now - x.ts <= WINDOW).length;

    switch (s.kind) {
      case 'booking': {
        p.bookings.push({ ts: now, amount: s.amountMinor ?? 0, city: s.city, passengers: s.meta?.passengers as number | undefined });
        p.bookingsTotal++;
        const recent = p.bookings.filter((x) => now - x.ts <= WINDOW);
        // suspicious booking velocity / never-travelled pattern (fake account signal)
        if (recent.length >= 6) {
          return this.raise('booking_velocity', 68, s, [`${recent.length} bookings in 1h`], ['rate_limit', 'suspend_account']);
        }
        // promo/bonus abuse: repeat redemptions tied to one device fingerprint
        if (s.meta?.promoRedeemed && s.deviceId) {
          p.promosByDevice++;
          if (p.promosByDevice >= 3) {
            return this.raise('promo_abuse', 72, s, [`${p.promosByDevice} promo redemptions from device ${s.deviceId}`], ['block_request', 'suspend_account']);
          }
        }
        break;
      }
      case 'wallet': {
        const isFund = (s.meta?.direction as string) !== 'withdraw';
        if (isFund) p.walletFunds.push({ ts: now, amount: s.amountMinor ?? 0 });
        else p.withdrawals.push({ ts: now, amount: s.amountMinor ?? 0 });
        // wallet fraud: rapid fund-then-withdraw cycling
        const funds = track(p.walletFunds), wds = track(p.withdrawals);
        if (funds >= 4 && wds >= 2) {
          return this.raise('wallet_cycling', 76, s, [`${funds} funds + ${wds} withdrawals in 1h`], ['rate_limit', 'suspend_account', 'alert_admins']);
        }
        // account takeover: credential change then immediate drain
        if (!isFund && p.credentialChangeAt && now - p.credentialChangeAt < 15 * 60_000 && (s.amountMinor ?? 0) > 5_000_000) {
          return this.raise('account_takeover_drain', 92, s, ['large withdrawal within 15min of credential change'], ['suspend_account', 'revoke_tokens', 'escalate_incident']);
        }
        break;
      }
      case 'refund': {
        p.refunds.push({ ts: now });
        const ratio = p.bookingsTotal ? p.refunds.length / p.bookingsTotal : 0;
        if (p.refunds.length >= 4 && ratio >= 0.6) {
          return this.raise('refund_abuse', 70, s, [`${p.refunds.length} refunds vs ${p.bookingsTotal} bookings (${(ratio * 100).toFixed(0)}%)`], ['rate_limit', 'alert_admins']);
        }
        break;
      }
      case 'escrow': {
        if (s.meta?.disputeAfterCompletion) {
          p.disputesAfterCompletion++;
          if (p.disputesAfterCompletion >= 3) {
            return this.raise('escrow_abuse', 74, s, ['repeated post-completion disputes'], ['alert_admins', 'escalate_incident']);
          }
        }
        break;
      }
      case 'vendor': {
        // fake vendor: self-dealing bookings + verification gaps
        if (s.meta?.selfDealtBookings && (s.meta?.selfDealtBookings as number) >= 3 && s.meta?.verificationGaps) {
          return this.raise('fake_vendor', 85, s, [`self-dealt bookings (${s.meta.selfDealtBookings}) with open verification gaps`], ['suspend_account', 'escalate_incident']);
        }
        break;
      }
      case 'account': {
        if (s.deviceId) {
          p.devicesSeen.push(s.deviceId);
          const accounts = this.deviceAccounts.get(s.deviceId) ?? new Set<string>();
          accounts.add(s.principal);
          this.deviceAccounts.set(s.deviceId, accounts);
          // fake accounts: many identities on one device
          if (accounts.size >= 3) {
            return this.raise('device_cluster_fake_accounts', 80, s, [`${accounts.size} accounts share device ${s.deviceId}`], ['suspend_account', 'alert_admins']);
          }
        }
        if (s.meta?.credentialChange) p.credentialChangeAt = now;
        // location spoofing: GPS jump beyond physical possibility
        if (s.meta?.spoofSignals) {
          return this.raise('location_spoofing', 78, s, (s.meta.spoofSignals as string[]), ['rate_limit', 'suspend_account']);
        }
        break;
      }
      case 'promo': {
        if (s.deviceId && s.meta?.referralRedeemed) {
          const accounts = this.deviceAccounts.get(s.deviceId);
          if (accounts && accounts.size >= 2) {
            return this.raise('referral_abuse', 66, s, [`referral redemption across ${accounts.size} accounts on one device`], ['block_request', 'alert_admins']);
          }
        }
        break;
      }
    }

    this.profiles.set(s.principal, p);
    return null;
  }

  private raise(rule: string, score: number, s: FraudSignal, evidence: string[], actions: string[]): FraudAlert {
    const a: FraudAlert = {
      id: `fra_${++this.seq}`, ts: s.ts ?? new Date(), rule, score,
      severity: score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low',
      principal: s.principal, evidence, recommendedActions: actions,
    };
    this.alerts.push(a);
    return a;
  }

  list(): FraudAlert[] { return [...this.alerts]; }
  trustScore(principal: string): number {
    const mine = this.alerts.filter((a) => a.principal === principal);
    if (!mine.length) return 100;
    return Math.max(0, 100 - Math.max(...mine.map((a) => a.score)));
  }
  private fresh(): PrincipalProfile {
    return { bookings: [], walletFunds: [], withdrawals: [], refunds: [], bookingsTotal: 0, promosByDevice: 0, disputesAfterCompletion: 0, devicesSeen: [] };
  }
}
