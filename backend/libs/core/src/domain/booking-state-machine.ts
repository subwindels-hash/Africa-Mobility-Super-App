import type { BookingStatus } from './types';

/**
 * Normative booking state machine (docs/05 SRS §4).
 * Illegal transitions throw — the API maps this to HTTP 409 ILLEGAL_STATE.
 */
export const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  draft: ['priced', 'cancelled'],
  priced: ['requested', 'cancelled'],
  requested: ['matched', 'expired', 'cancelled'],
  matched: ['confirmed', 'cancelled'],
  confirmed: ['en_route', 'cancelled', 'disputed'],
  en_route: ['in_progress', 'cancelled', 'disputed'],
  in_progress: ['completed', 'disputed'],
  completed: ['settled', 'disputed'],
  disputed: ['settled', 'refunded'],
  settled: [],
  cancelled: ['refunded'],
  expired: ['refunded'],
  refunded: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: BookingStatus, to: BookingStatus) {
    super(`Illegal booking transition ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!BOOKING_TRANSITIONS[from].includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/** Terminal states never leave. */
export function isTerminal(status: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[status].length === 0;
}

/** States considered "live" for ops dashboards / partial indexes. */
export const ACTIVE_STATUSES: readonly BookingStatus[] = [
  'requested', 'matched', 'confirmed', 'en_route', 'in_progress', 'disputed',
];
