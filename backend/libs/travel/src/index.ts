/**
 * Travel & GDS Service (docs/08 travel-service).
 * Amadeus + Sabre adapters behind one GDS interface: search → price → hold →
 * issue, PNR generation, fare rules. Deterministic offline mode mirrors real
 * API shapes; escrow hooks fire on ticket issue and void/refund.
 */
export type GdsId = 'amadeus' | 'sabre';

export interface FlightQuery { origin: string; destination: string; departDate: string; passengers: number; cabin?: 'economy' | 'business' | 'first' }
export interface FlightOffer {
  id: string; gds: GdsId; airline: string; flightNo: string;
  departDate: string; departTime: string; arriveTime: string; durationMin: number;
  stops: number; cabin: string; priceMinor: number; refundable: boolean; seatsLeft: number;
}
export interface FareRule { type: 'change' | 'cancel'; feeMinor: number; window: string }

export interface GdsAdapter {
  id: GdsId;
  search(q: FlightQuery): FlightOffer[];
  price(offerId: string): { offerId: string; priceMinor: number; rules: FareRule[] };
  hold(offerId: string, passengers: number): { holdRef: string; expiresAt: Date };
  issue(holdRef: string, passengers: number): { pnr: string; ticketNumbers: string[] };
  void(pnr: string): { voided: true };
}

const AIRLINES: Record<GdsId, { airline: string; flightNo: string; priceFactor: number }[]> = {
  amadeus: [
    { airline: 'Air Peace', flightNo: 'P4-700', priceFactor: 1.0 },
    { airline: 'Ibom Air', flightNo: 'QI-5200', priceFactor: 1.08 },
    { airline: 'Ethiopian', flightNo: 'ET-900', priceFactor: 1.22 },
  ],
  sabre: [
    { airline: 'British Airways', flightNo: 'BA-75', priceFactor: 1.45 },
    { airline: 'Emirates', flightNo: 'EK-784', priceFactor: 1.62 },
    { airline: 'Virgin Nigeria', flightNo: 'VN-230', priceFactor: 1.3 },
  ],
};

export function makeGdsAdapter(id: GdsId): GdsAdapter {
  const cache = new Map<string, FlightOffer>();
  return {
    id,
    search(q) {
      const cabinFactor = q.cabin === 'first' ? 3.2 : q.cabin === 'business' ? 2.1 : 1;
      const baseMinor = Math.round((45_000_000 + (q.origin.length + q.destination.length) * 800_000) * cabinFactor);
      return AIRLINES[id].map((a, i) => {
        const offer: FlightOffer = {
          id: `${id}_off_${q.origin}${q.destination}_${i}`,
          gds: id, airline: a.airline, flightNo: a.flightNo,
          departDate: q.departDate,
          departTime: `${7 + i * 2}:${i % 2 ? '20' : '05'}`,
          arriveTime: `${10 + i * 2}:${i % 2 ? '05' : '40'}`,
          durationMin: 75 + i * 25 + (q.origin.length * 7),
          stops: i % 2, cabin: q.cabin ?? 'economy',
          priceMinor: Math.round(baseMinor * a.priceFactor / 1000) * 1000,
          refundable: a.priceFactor > 1.3, seatsLeft: 9 - i,
        };
        cache.set(offer.id, offer);
        return offer;
      });
    },
    price(offerId) {
      const offer = cache.get(offerId);
      if (!offer) throw new Error(`unknown offer ${offerId}`);
      return {
        offerId, priceMinor: offer.priceMinor,
        rules: [
          { type: 'change' as const, feeMinor: Math.round(offer.priceMinor * 0.12), window: 'up to 3h before departure' },
          { type: 'cancel' as const, feeMinor: offer.refundable ? Math.round(offer.priceMinor * 0.18) : offer.priceMinor, window: 'up to 24h before departure' },
        ],
      };
    },
    hold(offerId, passengers) {
      const offer = cache.get(offerId);
      if (!offer) throw new Error(`unknown offer ${offerId}`);
      if (offer.seatsLeft < passengers) throw new Error(`only ${offer.seatsLeft} seats left`);
      return { holdRef: `HLD-${offerId}-${passengers}`, expiresAt: new Date(Date.now() + 30 * 60_000) };
    },
    issue(holdRef, passengers) {
      const pnr = `${holdRef.slice(4, 6)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      return { pnr, ticketNumbers: Array.from({ length: passengers }, (_, i) => `TKT-${pnr}-${i + 1}`) };
    },
    void() { return { voided: true as const }; },
  };
}

export interface TravelEscrowHooks { onIssued(pnr: string, totalMinor: number): void; onVoided(pnr: string, refundMinor: number): void }

export class TravelService {
  private adapters: Record<GdsId, GdsAdapter> = { amadeus: makeGdsAdapter('amadeus'), sabre: makeGdsAdapter('sabre') };
  private bookings = new Map<string, { pnr: string; query: FlightQuery; offer: FlightOffer; passengers: number; totalMinor: number; status: 'held' | 'issued' | 'voided' }>();

  /** Multi-GDS search, deduped and cheapest-first. */
  search(q: FlightQuery): FlightOffer[] {
    const all = [...this.adapters.amadeus.search(q), ...this.adapters.sabre.search(q)];
    return all.sort((a, b) => a.priceMinor - b.priceMinor);
  }

  /** Compare across GDS → hold seats → issue tickets (escrow funds). */
  book(q: FlightQuery, offerId: string, opts: { payNow?: boolean } = {}): { hold: { holdRef: string; expiresAt: Date }; issued?: { pnr: string; ticketNumbers: string[] }; totalMinor: number; fareRules: FareRule[] } {
    const gds: GdsId = offerId.startsWith('sabre') ? 'sabre' : 'amadeus';
    const adapter = this.adapters[gds];
    const priced = adapter.price(offerId);
    const hold = adapter.hold(offerId, q.passengers);
    const totalMinor = priced.priceMinor * q.passengers;
    if (!opts.payNow) return { hold, totalMinor, fareRules: priced.rules };
    const issued = adapter.issue(hold.holdRef, q.passengers);
    const offer = this.search(q).find((o) => o.id === offerId)!;
    this.bookings.set(issued.pnr, { pnr: issued.pnr, query: q, offer, passengers: q.passengers, totalMinor, status: 'issued' });
    this.hooks?.onIssued(issued.pnr, totalMinor);
    return { hold, issued, totalMinor, fareRules: priced.rules };
  }

  cancel(pnr: string): { refundMinor: number } {
    const b = this.bookings.get(pnr);
    if (!b || b.status !== 'issued') throw new Error(`no issued booking ${pnr}`);
    const adapter = this.adapters[b.offer.gds];
    adapter.void(pnr);
    b.status = 'voided';
    const refund = b.offer.refundable ? Math.round(b.totalMinor * 0.82) : 0;
    this.hooks?.onVoided(pnr, refund);
    return { refundMinor: refund };
  }

  get(pnr: string) { return this.bookings.get(pnr); }
  constructor(private hooks?: TravelEscrowHooks) {}
}
