/**
 * Interstate AI intelligence (docs/32 §route-optimization + §analytics).
 * Recommends best route, best vehicle, best logistics provider, estimated
 * cost and estimated delivery time — and aggregates the analytics dashboards.
 */
import type { ProviderOffer, QuoteRequest, Shipment, ShipmentStatus } from './shipments';
import { haversineKm } from './shipments';
import { bestVehicle, SERVICES, type ServiceSpec } from './catalog';

// ── § AI Route Optimization — 10 factors ────────────────────────────────────

export interface CorridorConditions {
  traffic: 'free' | 'moderate' | 'heavy';
  roadQuality: 'excellent' | 'good' | 'fair' | 'poor';
  weather: 'clear' | 'rain' | 'storm';
  securityAdvisory: number;          // 0..1 — security advisories
  weightRestrictionTons?: number;    // axle/load limits on the corridor
  tollNgn: number;                   // toll cost (recovered in price)
  fuelPriceNgnPerL: number;          // fuel-efficiency input
  deadlineHours?: number;            // delivery deadline
}

export interface RouteCandidate {
  id: string;
  via: string;                       // "A2 Lagos–Ibadan Expressway"
  distanceKm: number;
  baseHours: number;
  minRoadClass: 'street' | 'secondary' | 'primary' | 'highway' | 'truck_route';
  maxAxleTons: number;
  hasTolls: boolean;
  securityRisk: number;              // 0..1
}

export interface RouteScore {
  id: string; via: string; distanceKm: number; etaHours: number; score: number;
  fuelCostNgn: number; tollNgn: number; meetsDeadline: boolean; reasons: string[];
}

export class InterstateRouter {
  /** Score candidate corridors against all 10 optimization factors. */
  recommend(vehicleRateIndex: number, cargoTons: number, candidates: RouteCandidate[], c: CorridorConditions): RouteScore[] {
    return candidates.map((r) => {
      const reasons: string[] = [];
      let s = 100;

      // 1 distance
      const minKm = Math.min(...candidates.map((x) => x.distanceKm));
      if (r.distanceKm > minKm) { s -= Math.round((r.distanceKm - minKm) * 0.4); reasons.push(`${Math.round(r.distanceKm - minKm)} km longer than shortest`); }
      // 2 traffic
      const trafficPenalty = c.traffic === 'heavy' ? 18 : c.traffic === 'moderate' ? 7 : 0;
      s -= trafficPenalty;
      if (trafficPenalty) reasons.push(`${c.traffic} traffic`);
      // 3 road quality
      if (c.roadQuality === 'poor') { s -= 15; reasons.push('poor road quality'); }
      else if (c.roadQuality === 'excellent') reasons.push('excellent road quality');
      // 4 weather
      if (c.weather === 'storm') { s -= 20; reasons.push('storm — reduced speed'); }
      else if (c.weather === 'rain') { s -= 8; reasons.push('rain — cautious speeds'); }
      // 5 security advisories
      if (Math.max(r.securityRisk, c.securityAdvisory) > 0.6) { s -= 18; reasons.push('security advisory on corridor'); }
      else if (r.securityRisk < 0.2) reasons.push('secure corridor');
      // 6 vehicle restrictions (road class)
      const classOrder = ['street', 'secondary', 'primary', 'highway', 'truck_route'];
      const needs = classOrder.indexOf(r.minRoadClass);
      const vehicleNeed = ['street', 'secondary', 'primary', 'highway', 'truck_route'];
      void vehicleNeed;
      if (needs > classOrder.indexOf('primary') && vehicleRateIndex < 2) { s -= 10; reasons.push('light vehicles stuck on truck-grade road'); }
      // 7 weight restrictions
      if (cargoTons * 1000 > (c.weightRestrictionTons ?? 100) * 1000) { s -= 45; reasons.push(`axle limit ${c.weightRestrictionTons}t exceeded`); }
      if (cargoTons > r.maxAxleTons) { s -= 45; reasons.push(`corridor max ${r.maxAxleTons}t < ${cargoTons}t load`); }
      // 8 tolls (small penalty, cost recovered)
      if (r.hasTolls) { s -= 3; reasons.push('toll road'); }
      // 9 fuel efficiency — litres ≈ distance / (efficiency falls with rate index)
      const kmPerL = Math.max(2.4, 14 / vehicleRateIndex);
      const fuelCostNgn = Math.round((r.distanceKm / kmPerL) * c.fuelPriceNgnPerL);
      const tollNgn = r.hasTolls ? c.tollNgn : 0;
      s -= Math.round(fuelCostNgn / 20_000);
      // 10 delivery deadline
      const avgSpeed = c.traffic === 'heavy' ? 38 : c.traffic === 'moderate' ? 50 : 62;
      const etaHours = Math.round((r.baseHours * (62 / avgSpeed) * (c.weather === 'storm' ? 1.3 : c.weather === 'rain' ? 1.12 : 1)) * 10) / 10;
      const meetsDeadline = c.deadlineHours === undefined ? true : etaHours <= c.deadlineHours;
      if (!meetsDeadline) { s -= 30; reasons.push(`misses ${c.deadlineHours}h deadline`); }
      else if (c.deadlineHours !== undefined) reasons.push(`meets ${c.deadlineHours}h deadline`);

      return { id: r.id, via: r.via, distanceKm: r.distanceKm, etaHours, score: Math.max(0, Math.min(100, Math.round(s))), fuelCostNgn, tollNgn, meetsDeadline, reasons };
    }).sort((a, b) => b.score - a.score);
  }
}

/** Full AI recommendation: best route + best vehicle + best provider + cost + ETA. */
export interface FullRecommendation {
  route: RouteScore;
  vehicleLabel: string | null;
  recommendedVendorId: string | null;
  estimatedCostMinor: number;
  estimatedDeliveryHours: number;
  rationale: string[];
}

export function recommendShipments(
  router: InterstateRouter,
  req: QuoteRequest & { candidates: RouteCandidate[]; conditions: CorridorConditions },
  offers: ProviderOffer[],
  serviceCode: string,
): FullRecommendation {
  const spec: ServiceSpec = SERVICES.find((s) => s.code === serviceCode)!;
  const vehicle = bestVehicle(req.cargo, spec);
  const ranked = router.recommend(vehicle?.rateIndex ?? 1, req.cargo.weightKg / 1000, req.candidates, req.conditions);
  const bestRoute = ranked[0];
  const bestOffer = offers[0];
  const pricePerKmAt1 = 2_400;
  const costMinor = bestOffer
    ? bestOffer.priceMinor
    : Math.round(350_000 + bestRoute.distanceKm * pricePerKmAt1 * (vehicle?.rateIndex ?? 1));
  return {
    route: bestRoute,
    vehicleLabel: vehicle?.label ?? null,
    recommendedVendorId: bestOffer?.vendorId ?? null,
    estimatedCostMinor: costMinor + bestRoute.tollNgn * 100,
    estimatedDeliveryHours: bestOffer?.etaHours ?? bestRoute.etaHours,
    rationale: [
      ...bestRoute.reasons.slice(0, 3),
      ...(vehicle ? [`${vehicle.label} — best fit for ${req.cargo.weightKg}kg`] : []),
      ...(bestOffer ? [`Provider ${bestOffer.vendorName}: rating ${bestOffer.rating}, on-time ${bestOffer.onTimePct}%`] : []),
    ],
  };
}

// ── § Analytics dashboards ──────────────────────────────────────────────────

export interface AnalyticsDashboards {
  interstateRevenueMinor: number;          // revenue + commission
  commissionMinor: number;
  shipmentVolume: number;
  activeRoutes: { corridor: string; shipments: number }[];
  vehicleUtilization: { category: string; utilizationPct: number }[];
  vendorPerformance: { vendorId: string; rating: number; onTimePct: number; shipments: number }[];
  deliverySuccessRatePct: number;
  averageDeliveryHours: number;
  customerSatisfaction: number;            // avg rating 0..5
  fleetPerformance: { avgHealthPct: number; maintenanceDue: number };
}

export function buildDashboards(
  shipments: Shipment[],
  vehicleUtilization: { category: string; utilizationPct: number }[],
  fleet: { avgHealthPct: number; maintenanceDue: number },
): AnalyticsDashboards {
  const completed = shipments.filter((s) => s.status === 'completed');
  const failed = shipments.filter((s) => s.status === 'cancelled' || s.status === 'disputed');
  const rated = shipments.filter((s) => s.rating);
  const revenue = shipments.reduce((a, s) => a + (s.payment?.settledMinor ? s.quoteMinor ?? 0 : s.status === 'completed' ? s.quoteMinor ?? 0 : 0), 0);
  const corridorCount = new Map<string, number>();
  for (const s of shipments) {
    const key = s.stops.length >= 2 ? `${s.stops[0].stateCode}→${s.stops[s.stops.length - 1].stateCode}` : 'unknown';
    corridorCount.set(key, (corridorCount.get(key) ?? 0) + 1);
  }
  const vendorAgg = new Map<string, { rating: number[]; onTime: number[]; n: number }>();
  for (const s of shipments) {
    if (!s.party.vendorId) continue;
    const a = vendorAgg.get(s.party.vendorId) ?? { rating: [], onTime: [], n: 0 };
    if (s.rating) a.rating.push(s.rating.score);
    a.onTime.push(s.status === 'completed' ? 100 : 0);
    a.n += 1;
    vendorAgg.set(s.party.vendorId, a);
  }
  const avgDeliveryHours = completed.length
    ? Math.round(completed.reduce((a, s) => {
        const hours = (s.updatedAt.getTime() - s.createdAt.getTime()) / 3600_000;
        return a + hours;
      }, 0) / completed.length * 10) / 10
    : 0;
  return {
    interstateRevenueMinor: revenue,
    commissionMinor: Math.round(revenue * 0.12),
    shipmentVolume: shipments.length,
    activeRoutes: [...corridorCount.entries()].map(([corridor, n]) => ({ corridor, shipments: n })).sort((a, b) => b.shipments - a.shipments),
    vehicleUtilization,
    vendorPerformance: [...vendorAgg.entries()].map(([vendorId, a]) => ({
      vendorId,
      rating: a.rating.length ? Math.round((a.rating.reduce((x, y) => x + y, 0) / a.rating.length) * 10) / 10 : 0,
      onTimePct: a.onTime.length ? Math.round(a.onTime.reduce((x, y) => x + y, 0) / a.onTime.length) : 0,
      shipments: a.n,
    })).sort((a, b) => b.shipments - a.shipments),
    deliverySuccessRatePct: shipments.length ? Math.round((completed.length / (completed.length + failed.length || 1)) * 100) : 100,
    averageDeliveryHours: avgDeliveryHours,
    customerSatisfaction: rated.length ? Math.round((rated.reduce((a, s) => a + s.rating!.score, 0) / rated.length) * 10) / 10 : 0,
    fleetPerformance: fleet,
  };
}

export type AnalyticsInput = Parameters<typeof buildDashboards>[1];
export type FleetInput = Parameters<typeof buildDashboards>[2];
export type ShipmentStatusFilter = ShipmentStatus | undefined;
export { haversineKm };
