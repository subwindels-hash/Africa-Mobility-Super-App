/**
 * Autonomous driving architecture (docs/31 §4–7, §16) — sensor fusion,
 * environment understanding, operating modes and the safety governor.
 *
 * SAFETY-FIRST CONTRACT (spec §16): the system NEVER assumes map data or
 * street-level imagery alone is sufficient for real-time vehicle control.
 * Autonomy requires live sensor data + vehicle safety systems + validated
 * mapping + legal approval; when fusion confidence drops, the system
 * DOWNGRADES the operating mode rather than continuing autonomously.
 */

import type { OperatingMode, Vehicle } from './vehicles';

export type SensorSource =
  | 'gps' | 'digital_maps' | 'map_data' | 'street_imagery' | 'camera' | 'lidar'
  | 'radar' | 'ultrasonic' | 'vehicle_sensors' | 'hd_maps' | 'traffic_data' | 'road_condition';

export const SENSOR_SOURCES: Record<SensorSource, { live: boolean; weight: number; label: string }> = {
  gps: { live: true, weight: 1.0, label: 'GPS' },
  digital_maps: { live: false, weight: 0.6, label: 'Digital maps' },
  map_data: { live: false, weight: 0.6, label: 'Map data' },
  street_imagery: { live: false, weight: 0.4, label: 'Street-level imagery (where legally/technically available)' },
  camera: { live: true, weight: 1.0, label: 'Camera systems' },
  lidar: { live: true, weight: 1.2, label: 'LiDAR' },
  radar: { live: true, weight: 1.1, label: 'Radar' },
  ultrasonic: { live: true, weight: 0.8, label: 'Ultrasonic sensors' },
  vehicle_sensors: { live: true, weight: 1.0, label: 'Vehicle sensors' },
  hd_maps: { live: false, weight: 0.9, label: 'HD maps (validated)' },
  traffic_data: { live: true, weight: 0.7, label: 'Traffic data' },
  road_condition: { live: true, weight: 0.7, label: 'Road condition data' },
};

export type EnvironmentObject =
  | 'road' | 'intersection' | 'traffic_light' | 'stop_sign' | 'lane_marking'
  | 'vehicle' | 'pedestrian' | 'motorcycle' | 'bicycle' | 'obstacle'
  | 'construction_zone' | 'road_closure' | 'speed_limit' | 'bridge' | 'tunnel' | 'parking_area';

export const ENVIRONMENT_OBJECTS: EnvironmentObject[] = [
  'road', 'intersection', 'traffic_light', 'stop_sign', 'lane_marking', 'vehicle', 'pedestrian',
  'motorcycle', 'bicycle', 'obstacle', 'construction_zone', 'road_closure', 'speed_limit',
  'bridge', 'tunnel', 'parking_area',
];

export interface SensorReading {
  source: SensorSource;
  ts: Date;
  objects: Partial<Record<EnvironmentObject, number>>;   // object → confidence 0-1
  agreesWithPosition?: boolean;                          // corroborates GPS position
}

export interface EnvironmentModel {
  objects: Partial<Record<EnvironmentObject, number>>;   // fused per-object confidence
  positionConfidence: number;                            // 0-1 — multi-source agreement
  liveSourceCount: number;
  staticSourceCount: number;
  consistent: boolean;                                   // sensors agree with GPS+maps
}

export interface ModeGate {
  vehicleSupports: boolean;          // vehicle autonomy level & supported modes
  technologyAvailable: boolean;      // required sensors fused & consistent
  environmentSupported: boolean;     // road zone mapped/approved for the mode
  legalApproval: boolean;            // local laws permit this mode here
  safetyValidated: boolean;          // safety reqs satisfied (FAMS + governor)
}

export type SelfDriveCapability =
  | 'start_trip' | 'follow_route' | 'navigate_roads' | 'change_route' | 'respond_to_traffic'
  | 'stop_at_destination' | 'park' | 'avoid_obstacles' | 'respond_to_emergency';

export const SAFETY_PRIORITY = [
  '1. Human safety',
  '2. Regulatory compliance',
  '3. Vehicle safety',
  '4. Passenger safety',
  '5. Emergency response',
] as const;

export class AutonomousDriveSystem {
  /** Fuse sensor readings into an environment model — never a single source. */
  understandEnvironment(readings: SensorReading[]): EnvironmentModel {
    const live = readings.filter((r) => SENSOR_SOURCES[r.source]?.live ?? false);
    const stat = readings.filter((r) => !(SENSOR_SOURCES[r.source]?.live ?? false));

    // per-object confidence: weighted agreement across contributing sources
    const objects: Partial<Record<EnvironmentObject, number>> = {};
    for (const obj of ENVIRONMENT_OBJECTS) {
      let num = 0, den = 0;
      for (const r of readings) {
        const c = r.objects[obj];
        if (c === undefined) continue;
        const w = SENSOR_SOURCES[r.source]?.weight ?? 0.3;
        num += c * w; den += w;
      }
      if (den > 0) objects[obj] = Math.round((num / den) * 1000) / 1000;
    }

    // position confidence: live sensors must corroborate; static sources alone never suffice
    const corroborating = live.filter((r) => r.agreesWithPosition !== false).length;
    const contradicting = live.filter((r) => r.agreesWithPosition === false).length;
    const staticAgree = stat.length;
    let positionConfidence = 0;
    if (corroborating >= 2) positionConfidence = Math.min(1, 0.5 + 0.15 * corroborating + 0.05 * staticAgree);
    else if (corroborating === 1) positionConfidence = 0.45 + 0.1 * staticAgree;
    if (contradicting > 0) positionConfidence = Math.min(positionConfidence, 0.3);

    return {
      objects,
      positionConfidence: Math.round(Math.min(1, positionConfidence) * 1000) / 1000,
      liveSourceCount: live.length,
      staticSourceCount: stat.length,
      consistent: contradicting === 0 && corroborating >= 1,
    };
  }

  /**
   * Mode gate (spec §7): FULL autonomy only when vehicle supports it, the
   * technology is available, the environment is supported, local laws permit
   * and safety requirements are satisfied. EVERY condition must be true.
   */
  evaluateModeGate(vehicle: Vehicle, mode: OperatingMode, env: EnvironmentModel, famsAllowed: boolean, legalApproval: boolean): { gate: ModeGate; allowed: boolean; reason: string } {
    const needs = mode === 'full_autonomous' || mode === 'supervised_autonomous';
    const gate: ModeGate = {
      vehicleSupports: vehicle.modesSupported.includes(mode) && (mode !== 'full_autonomous' || vehicle.autonomyLevel >= 4),
      technologyAvailable: !needs || (env.liveSourceCount >= 2 && env.consistent && env.positionConfidence >= 0.7),
      environmentSupported: !needs || env.staticSourceCount >= 1,
      legalApproval: !needs || legalApproval,
      safetyValidated: famsAllowed,
    };
    const allowed = Object.values(gate).every(Boolean);
    const reason = allowed
      ? 'all gates satisfied'
      : `${Object.entries(gate).filter(([, v]) => !v).map(([k]) => k).join(', ')} failed`;
    return { gate, allowed, reason };
  }

  /**
   * Safety governor — continuous mode stewardship. When fusion confidence
   * drops or sensors contradict, autonomy is DOWNGRADED (never continues on
   * maps alone). Returns the effective mode plus actions.
   */
  govern(mode: OperatingMode, env: EnvironmentModel): { effectiveMode: OperatingMode; actions: string[] } {
    if (mode === 'manual') return { effectiveMode: 'manual', actions: [] };
    const actions: string[] = [];
    let effective = mode;

    if (env.liveSourceCount < 2 || !env.consistent || env.positionConfidence < 0.5) {
      if (mode === 'full_autonomous') { effective = 'supervised_autonomous'; actions.push('fusion confidence low — downgrade to supervised autonomy'); }
      else { effective = 'ai_assisted'; actions.push('fusion confidence low — downgrade to AI-assisted, human takes control'); }
    }
    if (env.objects.obstacle !== undefined && env.objects.obstacle > 0.8) actions.push('obstacle ahead — avoid or stop');
    if (env.objects.road_closure !== undefined && env.objects.road_closure > 0.7) actions.push('closure detected — replan route');
    if ((env.objects.pedestrian ?? 0) > 0.85) actions.push('vulnerable road user ahead — yield');
    return { effectiveMode: effective, actions };
  }

  /** Capabilities an autonomous vehicle may exercise where approved (§6). */
  capabilitiesFor(mode: OperatingMode): SelfDriveCapability[] {
    if (mode === 'manual') return [];
    if (mode === 'ai_assisted') return ['follow_route', 'navigate_roads', 'respond_to_traffic'];
    if (mode === 'supervised_autonomous') return ['start_trip', 'follow_route', 'navigate_roads', 'change_route', 'respond_to_traffic', 'avoid_obstacles', 'stop_at_destination'];
    return ['start_trip', 'follow_route', 'navigate_roads', 'change_route', 'respond_to_traffic', 'stop_at_destination', 'park', 'avoid_obstacles', 'respond_to_emergency'];
  }
}

/** Driver assistance (§3) — real-time guidance for human drivers. */
export interface AssistContext {
  speedKph: number;
  speedLimitKph?: number;
  trafficLevel?: 'free' | 'moderate' | 'heavy';
  weather?: 'clear' | 'rain' | 'storm' | 'harmattan' | 'fog';
  roadHazard?: string;
  hoursDriving?: number;
  vehicleHealth?: number;
  etaMin?: number;
  laneGuidanceSupported?: boolean;
}

export interface AssistMessage {
  channel: 'voice' | 'audio_alert' | 'dashboard' | 'mobile';
  priority: 'info' | 'warning' | 'critical';
  text: string;
}

export class DriverAssistant {
  /** Generate spoken/dashboard guidance from live context. */
  advise(ctx: AssistContext): AssistMessage[] {
    const out: AssistMessage[] = [];
    if (ctx.speedLimitKph && ctx.speedKph > ctx.speedLimitKph + 5) {
      out.push({ channel: 'voice', priority: ctx.speedKph > ctx.speedLimitKph + 20 ? 'critical' : 'warning', text: `You are ${Math.round(ctx.speedKph - ctx.speedLimitKph)} km/h over the limit. Slow down.` });
    }
    if (ctx.trafficLevel === 'heavy') out.push({ channel: 'dashboard', priority: 'info', text: `Heavy traffic ahead — best ETA ${Math.round((ctx.etaMin ?? 20) * 1.4)} min. Alternative route available.` });
    if (ctx.roadHazard) out.push({ channel: 'voice', priority: 'warning', text: `Road hazard ahead: ${ctx.roadHazard}.` });
    if (ctx.weather && ['rain', 'storm', 'fog'].includes(ctx.weather)) out.push({ channel: 'voice', priority: ctx.weather === 'storm' ? 'critical' : 'warning', text: `${ctx.weather === 'fog' ? 'Low visibility' : ctx.weather === 'storm' ? 'Storm conditions' : 'Rain'} — reduce speed and increase following distance.` });
    if ((ctx.hoursDriving ?? 0) >= 4) out.push({ channel: 'voice', priority: 'critical', text: `You have been driving ${ctx.hoursDriving} hours. Take a rest break within 30 minutes.` });
    if ((ctx.vehicleHealth ?? 100) < 60) out.push({ channel: 'mobile', priority: 'warning', text: `Vehicle health ${ctx.vehicleHealth}% — service recommended before your next long trip.` });
    if (ctx.laneGuidanceSupported) out.push({ channel: 'dashboard', priority: 'info', text: 'Keep right lane for your exit in 2 km.' });
    if (out.length === 0) out.push({ channel: 'dashboard', priority: 'info', text: `All clear — ${ctx.etaMin ? `ETA ${Math.round(ctx.etaMin)} min` : 'drive safely'}.` });
    return out;
  }
}
