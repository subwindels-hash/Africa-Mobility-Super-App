/**
 * AMSA shared domain types.
 * Money is ALWAYS integer minor units + ISO-4217 currency (see docs/09).
 */
export type Currency = 'NGN' | 'GHS' | 'KES' | 'ZAR' | 'AED' | 'GBP' | 'USD';

export interface Money {
  amount: number; // minor units (kobo for NGN)
  currency: Currency;
}

export function money(amount: number, currency: Currency = 'NGN'): Money {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Invalid money amount: ${amount} (must be non-negative integer minor units)`);
  }
  return { amount, currency };
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export type Vertical = 'transportation' | 'logistics' | 'travel' | 'aviation' | 'marine' | 'security' | 'corporate_services';

export type BookingType = 'instant' | 'scheduled' | 'corporate' | 'recurring' | 'quote_based';

export type BookingStatus =
  | 'draft' | 'priced' | 'requested' | 'matched' | 'confirmed'
  | 'en_route' | 'in_progress' | 'completed' | 'settled'
  | 'cancelled' | 'expired' | 'disputed' | 'refunded';

export type UserType =
  | 'customer' | 'driver' | 'dispatch_rider' | 'vendor' | 'fleet_owner'
  | 'travel_agent' | 'security_provider' | 'jet_operator' | 'helicopter_operator'
  | 'corporate_client' | 'support_agent' | 'admin' | 'super_admin';

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

/** Haversine distance in meters. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}
