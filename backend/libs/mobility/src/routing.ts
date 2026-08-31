/**
 * AI Vehicle Route Intelligence (§8) — multi-factor, vehicle-class-aware
 * routing, plus Fleet Intelligence (§9), autonomous pipelines (§10–11),
 * the safety system (§12) and the vehicle-cybersecurity bridge (§13).
 */

import { VEHICLE_CLASSES, type Vehicle, type OperatingMode, driverScore, type MonitoringAlert } from './vehicles';
import type { OperatingMode as OM } from './vehicles';

export interface RouteFactor {
  distanceKm: number;
  traffic: 'free' | 'moderate' | 'heavy';
  roadQuality: 'good' | 'fair' | 'poor';
  weather: 'clear' | 'rain' | 'storm';
  closures?: string[];
  securityRisk?: number;            // 0-1 (security conditions along the route)
  vehicle: Vehicle;
  load?: { passengers?: number; parcels?: number; weightKg?: number };
  requirement?: 'passenger_comfort' | 'fast_delivery' | 'heavy_load' | 'autonomous_supported';
}

export interface RouteOption {
  id: string;
  via: string;
  distanceKm: number;
  etaMin: number;
  suitability: number;              // 0-100 for THIS vehicle
  reasons: string[];
  autonomousSupported: boolean;
}

export class RouteIntelligence {
  /** Score candidate routes for a specific vehicle — different vehicles get different recommendations. */
  recommend(factor: RouteFactor, candidates: { id: string; via: string; distanceKm: number; baseEtaMin: number; roadTypes: string[]; closures?: string[] }[]): RouteOption[] {
    const cls = VEHICLE_CLASSES.find((c) => c.cls === factor.vehicle.cls)!;
    const minKm = Math.min(...candidates.map((c) => c.distanceKm));
    return candidates
      .map((c) => {
        const reasons: string[] = [];
        let s = 100;

        // road access for this vehicle class
        const unusable = c.roadTypes.filter((rt) => !cls.roadAccess.includes(rt));
        if (unusable.length) { s -= 15 * unusable.length; reasons.push(`${factor.vehicle.cls} should avoid ${unusable.join('/')}`); }
        else reasons.push(`route matches ${factor.vehicle.cls} access`);
        // heavy trucks are restricted to designated truck routes
        if (factor.vehicle.cls === 'truck' && !c.roadTypes.includes('truck_route')) { s -= 25; reasons.push('heavy trucks restricted to truck routes'); }
        // distance tie-break — shorter is better all else equal
        if (c.distanceKm > minKm) { s -= Math.round((c.distanceKm - minKm) * 0.5); }

        // traffic
        const trafficPenalty = factor.traffic === 'heavy' ? 20 : factor.traffic === 'moderate' ? 8 : 0;
        s -= trafficPenalty;
        if (trafficPenalty) reasons.push(`${factor.traffic} traffic (+${Math.round(trafficPenalty / 2)} min)`);

        // road quality vs vehicle
        if (factor.roadQuality === 'poor' && ['car', 'taxi', 'chauffeur', 'bus'].includes(factor.vehicle.cls)) { s -= 15; reasons.push('poor road quality penalized for this class'); }
        if (factor.roadQuality === 'poor' && (factor.vehicle.cls === 'suv' || factor.vehicle.cls === 'motorcycle')) reasons.push('unpaved-tolerant class — poor road accepted');

        // weather
        if (factor.weather === 'storm' && factor.vehicle.cls === 'motorcycle') { s -= 40; reasons.push('storm riding strongly discouraged'); }
        else if (factor.weather === 'rain') { s -= 8; reasons.push('rain — slower speeds'); }

        // security conditions
        if ((factor.securityRisk ?? 0) > 0.6) { s -= 18; reasons.push('elevated security risk along corridor'); }

        // closures
        if (c.closures?.length) { s -= 25; reasons.push(`closure: ${c.closures.join(', ')}`); }

        // requirements
        if (factor.requirement === 'fast_delivery' && factor.vehicle.cls !== 'delivery_bike' && factor.vehicle.cls !== 'motorcycle') { s -= 10; reasons.push('bike-class vehicles beat cars for instant dispatch'); }
        if (factor.requirement === 'heavy_load' && factor.vehicle.cls !== 'truck') { s -= 30; reasons.push('heavy load requires truck class'); }
        if (factor.load?.weightKg && factor.load.weightKg > 1500 && factor.vehicle.cls !== 'truck') { s -= 30; reasons.push(`${factor.load.weightKg}kg exceeds non-truck capacity`); }

        // autonomous vehicles need AV-mapped roads
        const autonomousSupported = c.roadTypes.includes('av_mapped');
        if (factor.vehicle.autonomyLevel >= 3) {
          if (autonomousSupported) reasons.push('AV-mapped corridor — autonomy permitted');
          else { s -= 35; reasons.push('not AV-mapped — autonomy will hand over to human'); }
        }

        const etaMin = Math.round(c.baseEtaMin * (1 + trafficPenalty / 60) * (factor.weather === 'storm' ? 1.25 : factor.weather === 'rain' ? 1.1 : 1));
        return { id: c.id, via: c.via, distanceKm: c.distanceKm, etaMin, suitability: Math.max(0, Math.min(100, Math.round(s))), reasons, autonomousSupported };
      })
      .sort((a, b) => b.suitability - a.suitability);
  }
}

// ── §9 Fleet Intelligence ───────────────────────────────────────────────────

export interface FleetVehicleStats {
  vehicle: Vehicle;
  utilizationPct: number;
  revenueMinor30d: number;
  fuelOrEnergyUse: number;          // normalized units
  safetyEvents30d: number;
  routeEfficiencyPct: number;
  maintenanceDueInKm?: number;
}

export interface FleetRecommendation {
  kind: 'maintenance_alert' | 'replacement' | 'allocation' | 'positioning' | 'cost_reduction';
  vehicleId?: string;
  action: string;
  impact: string;
}

export class FleetIntelligence {
  analyze(stats: FleetVehicleStats[]): { recommendations: FleetRecommendation[]; fleetSummary: Record<string, number> } {
    const recs: FleetRecommendation[] = [];
    for (const s of stats) {
      if (s.vehicle.healthScore < 55 || (s.maintenanceDueInKm ?? 1e9) < 500) {
        recs.push({ kind: 'maintenance_alert', vehicleId: s.vehicle.id, action: `Schedule maintenance for ${s.vehicle.code} (health ${s.vehicle.healthScore}%)`, impact: 'avoid breakdown + safety events' });
      }
      if (s.vehicle.healthScore < 40 && s.utilizationPct < 35) {
        recs.push({ kind: 'replacement', vehicleId: s.vehicle.id, action: `Recommend replacing ${s.vehicle.code} — low health and low utilization`, impact: 'capex saved by right-sizing fleet' });
      }
      if (s.utilizationPct > 85 && s.routeEfficiencyPct < 60) {
        recs.push({ kind: 'allocation', vehicleId: s.vehicle.id, action: `Re-allocate ${s.vehicle.code} to higher-efficiency corridors`, impact: '+8-12% revenue per vehicle' });
      }
      if (s.safetyEvents30d >= 3) {
        recs.push({ kind: 'maintenance_alert', vehicleId: s.vehicle.id, action: `${s.vehicle.code}: ${s.safetyEvents30d} safety events in 30d — driver coaching + inspection`, impact: 'safety risk reduced' });
      }
      if (s.fuelOrEnergyUse > 2.2 && s.routeEfficiencyPct < 70) {
        recs.push({ kind: 'cost_reduction', vehicleId: s.vehicle.id, action: `Optimize ${s.vehicle.code} routing/eco-training — high energy use vs efficiency`, impact: 'fuel/energy -10-15%' });
      }
    }
    if (stats.length >= 3) {
      const idle = stats.filter((s) => s.utilizationPct < 25);
      if (idle.length) recs.push({ kind: 'positioning', action: `Reposition ${idle.map((s) => s.vehicle.code).join(', ')} toward predicted demand zones`, impact: 'idle time -20%' });
    }
    return {
      recommendations: recs,
      fleetSummary: {
        vehicles: stats.length,
        avgUtilization: Math.round(stats.reduce((s, x) => s + x.utilizationPct, 0) / Math.max(1, stats.length)),
        avgHealth: Math.round(stats.reduce((s, x) => s + x.vehicle.healthScore, 0) / Math.max(1, stats.length)),
        safetyEvents30d: stats.reduce((s, x) => s + x.safetyEvents30d, 0),
      },
    };
  }
}

// ── §10–11 Autonomous delivery & ride-hailing pipelines ────────────────────

export type PipelineStep = { step: string; ok: boolean; detail: string };

export function autonomousDeliveryPlan(opts: { allowed: boolean; vehicleAssigned: boolean; routeFound: boolean; autonomous: boolean; tracked: boolean; confirmed: boolean }): { steps: PipelineStep[]; completed: boolean } {
  const steps: PipelineStep[] = [
    { step: 'Customer request', ok: true, detail: 'delivery request received' },
    { step: 'AI delivery planning', ok: true, detail: 'items, window and zone constraints resolved' },
    { step: 'Vehicle assignment', ok: opts.vehicleAssigned, detail: opts.vehicleAssigned ? 'vehicle assigned' : 'no eligible vehicle' },
    { step: 'Route planning', ok: opts.routeFound, detail: opts.routeFound ? 'vehicle-class-aware route selected' : 'no viable route' },
    { step: opts.autonomous ? 'Autonomous delivery' : 'Human-operated delivery', ok: opts.allowed || !opts.autonomous, detail: !opts.allowed && opts.autonomous ? 'autonomous delivery NOT activated (FAMS)' : 'underway' },
    { step: 'Real-time tracking', ok: opts.tracked, detail: 'live telemetry streaming' },
    { step: 'Delivery confirmation', ok: opts.confirmed, detail: 'customer confirmation + escrow release' },
  ];
  return { steps, completed: steps.every((s) => s.ok) };
}

export function autonomousRidePlan(opts: { matched: boolean; avAssigned: boolean; allowed: boolean; pickup: boolean; trip: boolean; arrived: boolean; paid: boolean }): { steps: PipelineStep[]; completed: boolean } {
  const steps: PipelineStep[] = [
    { step: 'Customer request', ok: true, detail: 'ride requested' },
    { step: 'AI matching', ok: opts.matched, detail: opts.matched ? 'best vehicle matched' : 'no supply' },
    { step: 'Autonomous vehicle assignment', ok: opts.avAssigned, detail: opts.avAssigned ? 'AV assigned' : 'human-driven vehicle assigned' },
    { step: 'Route planning', ok: true, detail: 'route planned' },
    { step: 'Passenger pickup', ok: opts.pickup, detail: opts.pickup ? 'passenger on board (OTP verified)' : 'pickup failed' },
    { step: opts.avAssigned && opts.allowed ? 'Autonomous trip' : 'Trip', ok: opts.trip, detail: !opts.allowed && opts.avAssigned ? 'autonomy blocked — human drive fallback' : 'in progress' },
    { step: 'Destination arrival', ok: opts.arrived, detail: 'arrived' },
    { step: 'Trip completion', ok: opts.arrived && opts.trip, detail: 'completed' },
    { step: 'Payment settlement', ok: opts.paid, detail: 'escrow settled to vendor' },
  ];
  return { steps, completed: steps.every((s) => s.ok) };
}

// ── §12 Safety system ───────────────────────────────────────────────────────

export type SafetyEventType = 'collision_risk' | 'dangerous_road' | 'vehicle_failure' | 'driver_emergency' | 'passenger_emergency' | 'unusual_movement';

export interface SafetyResponse {
  alerts: ('driver' | 'passengers' | 'fleet_operators' | 'emergency_contacts')[];
  workflow: 'none' | 'emergency_workflow' | 'safe_stop';
  immobilize: boolean;               // only where supported AND legally permitted
  escalateToHumans: boolean;
}

export const SAFETY_RESPONSES: Record<SafetyEventType, (ctx: { severity: number; immobilizeSupported: boolean; legallyPermitted: boolean }) => SafetyResponse> = {
  collision_risk: ({ severity }) => ({
    alerts: severity >= 0.8 ? ['driver', 'passengers', 'fleet_operators'] : ['driver'],
    workflow: severity >= 0.8 ? 'emergency_workflow' : 'none',
    immobilize: false, escalateToHumans: severity >= 0.8,
  }),
  dangerous_road: () => ({ alerts: ['driver'], workflow: 'none', immobilize: false, escalateToHumans: false }),
  vehicle_failure: ({ severity }) => ({
    alerts: ['driver', 'fleet_operators'], workflow: severity >= 0.7 ? 'safe_stop' : 'none',
    immobilize: false, escalateToHumans: severity >= 0.7,
  }),
  driver_emergency: ({ severity }) => ({
    alerts: ['passengers', 'fleet_operators', 'emergency_contacts'], workflow: 'emergency_workflow',
    immobilize: false, escalateToHumans: true,
  }),
  passenger_emergency: ({ severity, immobilizeSupported, legallyPermitted }) => ({
    alerts: ['driver', 'passengers', 'fleet_operators', 'emergency_contacts'], workflow: 'emergency_workflow',
    immobilize: severity >= 0.9 && immobilizeSupported && legallyPermitted,
    escalateToHumans: true,
  }),
  unusual_movement: ({ severity }) => ({
    alerts: ['fleet_operators'], workflow: severity >= 0.8 ? 'safe_stop' : 'none',
    immobilize: false, escalateToHumans: severity >= 0.8,
  }),
};

// ── §13 Vehicle cybersecurity (SHIELD bridge) ──────────────────────────────

export type VehicleSecuritySignal =
  | 'gps_spoofing' | 'unauthorized_remote_access' | 'communication_attack'
  | 'malicious_command' | 'sensor_manipulation' | 'vehicle_identity_fraud';

/** Classify a vehicle-layer event into a SHIELD security signal. */
export function classifyVehicleSecurity(input: {
  command?: string; principal?: string; authorizedPrincipals?: string[];
  sensorContradiction?: boolean; vinMatch?: boolean; remoteAccess?: boolean;
}): VehicleSecuritySignal | null {
  if (input.command && /disable_brakes|override_safety|ignore_sensors|bypass_geofence/i.test(input.command)) return 'malicious_command';
  if (input.remoteAccess && (!input.principal || !(input.authorizedPrincipals ?? []).includes(input.principal))) return 'unauthorized_remote_access';
  if (input.sensorContradiction) return 'sensor_manipulation';
  if (input.vinMatch === false) return 'vehicle_identity_fraud';
  return null;
}

export const COMMAND_AUTH_MODEL = {
  authentication: 'mutual TLS + per-vehicle certificate (no anonymous commands)',
  authorization: 'capability-scoped tokens — commands allowed only for the vehicle\'s assigned operator',
  encryption: 'E2E encrypted channel; commands signed and replay-protected',
  safety: 'safety-critical commands additionally require FAMS activation + SHIELD policy approval',
} as const;

export type { OperatingMode, OM };
export { driverScore };
