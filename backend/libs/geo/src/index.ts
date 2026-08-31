/**
 * Geo/Maps Service (docs/08 geo-service).
 * Google Maps primary + OpenStreetMap backup behind one interface with
 * circuit-breaker failover and caching. Offline deterministic mode returns
 * plausible coordinates/routes; the failover logic is the tested contract.
 */
export type ProviderId = 'google_maps' | 'osm';

export interface LatLng { lat: number; lng: number }
export interface RouteLeg { distanceKm: number; durationMin: number }
export interface GeocodeResult { formatted: string; lat: number; lng: number; provider: ProviderId }

export interface GeoProvider {
  id: ProviderId;
  geocode(query: string): GeocodeResult;
  reverse(p: LatLng): GeocodeResult;
  route(from: LatLng, to: LatLng): RouteLeg & { polyline: [number, number][] };
}

export function makeGoogleMaps(): GeoProvider {
  return {
    id: 'google_maps',
    geocode(query) { return { formatted: `${query}, Nigeria (Google)`, lat: 6.5244 + h(query), lng: 3.3792 + h(query + 'x'), provider: 'google_maps' }; },
    reverse(p) { return { formatted: `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)} (Google)`, lat: p.lat, lng: p.lng, provider: 'google_maps' }; },
    route(from, to) { const d = haversine(from, to); return { distanceKm: d, durationMin: Math.round(d / 28 * 60), polyline: [[from.lat, from.lng], [to.lat, to.lng]] }; },
  };
}

export function makeOsm(): GeoProvider {
  return {
    id: 'osm',
    geocode(query) { return { formatted: `${query}, Nigeria (OSM/Nominatim)`, lat: 6.5244 + h(query), lng: 3.3792 + h(query), provider: 'osm' }; },
    reverse(p) { return { formatted: `${p.lat.toFixed(3)}, ${p.lng.toFixed(3)} (OSM)`, lat: p.lat, lng: p.lng, provider: 'osm' }; },
    route(from, to) { const d = haversine(from, to) * 1.08; return { distanceKm: Math.round(d * 10) / 10, durationMin: Math.round(d / 24 * 60), polyline: [[from.lat, from.lng], [to.lat, to.lng]] }; },   // OSRM-style detour
  };
}

function h(s: string): number { return (s.length % 7) / 500; }
function haversine(a: LatLng, b: LatLng): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 10) / 10;
}

export class CircuitBreaker {
  state: 'closed' | 'open' | 'half_open' = 'closed';
  failures = 0;
  openedAt?: Date;
  constructor(private threshold = 3, private cooldownMs = 30_000) {}
  recordSuccess() { this.failures = 0; this.state = 'closed'; }
  recordFailure(now = new Date()) {
    this.failures++;
    if (this.failures >= this.threshold) { this.state = 'open'; this.openedAt = now; }
  }
  allow(now = new Date()): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open' && this.openedAt && now.getTime() - this.openedAt.getTime() >= this.cooldownMs) { this.state = 'half_open'; return true; }
    return this.state === 'half_open';
  }
}

export class GeoService {
  private primary: GeoProvider;
  private backup: GeoProvider;
  private cache = new Map<string, GeocodeResult>();
  readonly breaker = new CircuitBreaker();
  /** Test hook — simulate the primary being down. */
  primaryDown = false;

  constructor(primary = makeGoogleMaps(), backup = makeOsm()) { this.primary = primary; this.backup = backup; }

  geocode(query: string): GeocodeResult & { cached: boolean } {
    const key = `geo:${query.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit) return { ...hit, cached: true };
    const result = this.withFailover((p) => p.geocode(query));
    this.cache.set(key, result);
    return { ...result, cached: false };
  }

  reverse(p: LatLng): GeocodeResult { return this.withFailover((prov) => prov.reverse(p)); }
  route(from: LatLng, to: LatLng): RouteLeg & { provider: ProviderId; polyline: [number, number][] } {
    return { ...this.withFailover((prov) => prov.route(from, to)), provider: this.lastProvider };
  }
  private lastProvider: ProviderId = 'google_maps';

  private withFailover<T>(op: (p: GeoProvider) => T): T {
    if (this.primaryDown || !this.breaker.allow()) {
      const out = op(this.backup);
      this.lastProvider = 'osm';
      if (this.primaryDown) this.breaker.recordFailure();
      return out;
    }
    try {
      const out = op(this.primary);
      this.breaker.recordSuccess();
      this.lastProvider = 'google_maps';
      return out;
    } catch {
      this.breaker.recordFailure();
      this.lastProvider = 'osm';
      return op(this.backup);
    }
  }
}
