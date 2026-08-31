/**
 * Autonomous AI Mobility — Vehicle Tracking & Intelligence core (docs/31 §1–2).
 *
 * Monitors every asset class on the platform — cars, taxis, SUVs, chauffeur
 * vehicles, delivery bikes, motorcycles, trucks, buses, autonomous vehicles,
 * and future aircraft/marine assets — and continuously analyzes movement,
 * driving behaviour, route efficiency and delivery/trip progress.
 */

export type VehicleClass =
  | 'car' | 'taxi' | 'suv' | 'chauffeur' | 'delivery_bike' | 'motorcycle'
  | 'truck' | 'bus' | 'autonomous_vehicle' | 'aircraft' | 'marine';

export const VEHICLE_CLASSES: { cls: VehicleClass; label: string; roadAccess: string[] }[] = [
  { cls: 'car', label: 'Car', roadAccess: ['primary', 'secondary', 'residential'] },
  { cls: 'taxi', label: 'Taxi', roadAccess: ['primary', 'secondary', 'residential'] },
  { cls: 'suv', label: 'SUV', roadAccess: ['primary', 'secondary', 'residential', 'unpaved'] },
  { cls: 'chauffeur', label: 'Chauffeur Vehicle', roadAccess: ['primary', 'secondary', 'residential'] },
  { cls: 'delivery_bike', label: 'Delivery Bike', roadAccess: ['primary', 'secondary', 'residential', 'bike_lane', 'narrow'] },
  { cls: 'motorcycle', label: 'Motorcycle', roadAccess: ['primary', 'secondary', 'residential', 'bike_lane', 'narrow'] },
  { cls: 'truck', label: 'Truck', roadAccess: ['primary', 'truck_route'] },
  { cls: 'bus', label: 'Bus', roadAccess: ['primary', 'bus_route'] },
  { cls: 'autonomous_vehicle', label: 'Autonomous Vehicle', roadAccess: ['primary', 'secondary', 'av_mapped'] },
  { cls: 'aircraft', label: 'Aircraft (future)', roadAccess: [] },
  { cls: 'marine', label: 'Marine Asset (future)', roadAccess: [] },
];

export interface Vehicle {
  id: string;                       // veh_1 / av_7
  code: string;
  cls: VehicleClass;
  fleetId?: string;
  vendorId?: string;
  /** SAE J3016 level 0–5 (0 = human only). */
  autonomyLevel: number;
  modesSupported: OperatingMode[];
  status: 'active' | 'maintenance' | 'offline' | 'retired';
  healthScore: number;              // 0-100
  fuelOrBatteryPct?: number;        // where supported
  telematics: boolean;              // engine/fuel telemetry available
}

export type OperatingMode = 'manual' | 'ai_assisted' | 'supervised_autonomous' | 'full_autonomous';

export const OPERATING_MODES: Record<OperatingMode, { label: string; human: string }> = {
  manual: { label: 'Manual', human: 'human drives · AI optional assistance' },
  ai_assisted: { label: 'AI Assisted', human: 'AI assists navigation/traffic/safety · human drives' },
  supervised_autonomous: { label: 'Supervised Autonomous', human: 'AI controls selected functions · qualified human supervises' },
  full_autonomous: { label: 'Full Autonomous', human: 'AI drives — only when vehicle, tech, environment, law & safety ALL allow' },
};

export interface TelemetryFrame {
  vehicleId: string;
  ts: Date;
  lat: number; lng: number;
  speedKph: number;
  headingDeg: number;
  routeId?: string;
  destination?: { lat: number; lng: number; label?: string };
  driverStatus?: 'active' | 'idle' | 'on_break' | 'resting' | 'offline' | 'none';   // none = autonomous
  vehicleStatus?: 'on_trip' | 'idle' | 'charging' | 'maintenance' | 'offline';
  engineOn?: boolean;
  fuelOrBatteryPct?: number;
  healthScore?: number;
  roadZone?: string;                // zone:NG-LAG-EKO-ATLANTIC
  meta?: Record<string, unknown>;
}

export type MonitoringAlertType =
  | 'route_deviation' | 'unexpected_stop' | 'geofence_violation' | 'excessive_speed'
  | 'sudden_braking' | 'aggressive_acceleration' | 'dangerous_driving' | 'suspicious_stop'
  | 'possible_theft' | 'gps_spoofing' | 'unauthorized_usage' | 'possible_accident';

export interface MonitoringAlert {
  id: string;
  ts: Date;
  vehicleId: string;
  type: MonitoringAlertType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: string[];
}

const SEVERITY_FOR: Record<MonitoringAlertType, 'critical' | 'high' | 'medium' | 'low'> = {
  possible_accident: 'critical', gps_spoofing: 'critical', possible_theft: 'critical',
  geofence_violation: 'high', sudden_braking: 'medium', aggressive_acceleration: 'medium',
  excessive_speed: 'high', dangerous_driving: 'high', route_deviation: 'medium',
  unexpected_stop: 'medium', suspicious_stop: 'high', unauthorized_usage: 'high',
};

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface VehicleState {
  last?: TelemetryFrame;
  prev?: TelemetryFrame;
  history: TelemetryFrame[];
  stops: { ts: number; lat: number; lng: number; durationMin: number; planned: boolean; alerted?: boolean }[];
  behaviorFlags: number;           // rolling dangerous-driving strikes
}

export interface MonitoringPolicy {
  speedLimitKph: number;           // hard limit above which speeding is flagged
  deviationKm: number;             // off-route distance that counts as deviation
  stopMinutes: number;             // unmoving duration → unexpected stop
  teleportKmPerMin: number;        // impossible movement → GPS spoofing
  harshBrakeKphPerS: number;
  harshAccelKphPerS: number;
}

export const DEFAULT_MONITORING_POLICY: MonitoringPolicy = {
  speedLimitKph: 120, deviationKm: 1.5, stopMinutes: 10, teleportKmPerMin: 3, harshBrakeKphPerS: 12, harshAccelKphPerS: 12,
};

export class VehicleIntelligenceEngine {
  private vehicles = new Map<string, Vehicle>();
  private states = new Map<string, VehicleState>();
  private alerts: MonitoringAlert[] = [];
  private seq = 0;

  constructor(private policy: MonitoringPolicy = DEFAULT_MONITORING_POLICY) {}

  register(v: Omit<Vehicle, 'healthScore'> & { healthScore?: number }): Vehicle {
    const veh: Vehicle = { healthScore: 100, ...v } as Vehicle;
    this.vehicles.set(v.id, veh);
    return veh;
  }
  get(id: string): Vehicle | undefined { return this.vehicles.get(id); }
  list(): Vehicle[] { return [...this.vehicles.values()]; }

  /** Ingest one telemetry frame → real-time monitoring alerts (spec §1–2). */
  ingest(frame: TelemetryFrame): MonitoringAlert[] {
    const st = this.states.get(frame.vehicleId) ?? { history: [], stops: [], behaviorFlags: 0 };
    const alerts: MonitoringAlert[] = [];
    const prev = st.last;

    if (prev) {
      const minutes = Math.max(0.05, (frame.ts.getTime() - prev.ts.getTime()) / 60_000);
      const moved = km(prev, frame);

      // ── GPS spoofing: physically impossible movement ──
      if (moved / minutes > this.policy.teleportKmPerMin * 60) {
        alerts.push(this.raise(frame, 'gps_spoofing', [`${moved.toFixed(1)} km in ${(minutes * 60).toFixed(0)}s — physically impossible`]));
      } else {
        // ── excessive speeding ──
        if (frame.speedKph > this.policy.speedLimitKph) {
          alerts.push(this.raise(frame, 'excessive_speed', [`${frame.speedKph} km/h over ${this.policy.speedLimitKph} limit`]));
        }
        // ── harsh events (accel/brake) ──
        const dv = frame.speedKph - prev.speedKph;
        const rate = dv / (minutes * 60);
        if (rate <= -this.policy.harshBrakeKphPerS) alerts.push(this.raise(frame, 'sudden_braking', [`${rate.toFixed(1)} km/h/s deceleration`]));
        if (rate >= this.policy.harshAccelKphPerS) alerts.push(this.raise(frame, 'aggressive_acceleration', [`${rate.toFixed(1)} km/h/s acceleration`]));

        // ── route deviation ──
        if (frame.destination && frame.routeId) {
          const direct = km(frame, frame.destination);
          const prevDirect = km(prev, prev.destination ?? frame.destination);
          if (direct > prevDirect + this.policy.deviationKm && moved > 0.2) {
            alerts.push(this.raise(frame, 'route_deviation', [`moved ${this.policy.deviationKm}km+ away from destination despite driving`]));
          }
        }

        // ── stops: stationary time since last movement ──
        if (moved < 0.05 && frame.speedKph < 2) {
          let open = st.stops.at(-1);
          if (!open || open.durationMin > 0) {
            open = { ts: prev.ts.getTime(), lat: frame.lat, lng: frame.lng, durationMin: 0, planned: frame.driverStatus === 'on_break' };
            st.stops.push(open);
          }
          open.durationMin = (frame.ts.getTime() - open.ts) / 60_000;
          if (open.durationMin >= this.policy.stopMinutes && !open.alerted) {
            open.alerted = true;
            const suspicious = frame.vehicleStatus !== 'charging' && frame.driverStatus !== 'on_break' && frame.driverStatus !== 'resting';
            alerts.push(this.raise(frame, suspicious ? 'suspicious_stop' : 'unexpected_stop', [
              `${open.durationMin.toFixed(0)}min stationary at ${frame.lat.toFixed(3)},${frame.lng.toFixed(3)}${suspicious ? ' (not on a planned break)' : ''}`,
            ]));
          }
        } else {
          st.stops.length = 0;
        }

        // ── possible accident: violent decel then no movement ──
        if (prev.speedKph > 50 && frame.speedKph < 5 && rate < -this.policy.harshBrakeKphPerS * 1.5) {
          alerts.push(this.raise(frame, 'possible_accident', [`hard deceleration ${prev.speedKph}→${frame.speedKph} km/h`]));
        }

        // ── possible theft / unauthorized usage: movement with no assigned driver & not autonomous ──
        const veh = this.vehicles.get(frame.vehicleId);
        if (veh && frame.speedKph > 15 && frame.driverStatus === 'none' && veh.autonomyLevel < 4) {
          alerts.push(this.raise(frame, 'unauthorized_usage', ['vehicle in motion with no driver assigned and autonomy < L4']));
        }
        if (veh && frame.ts.getHours() >= 1 && frame.ts.getHours() <= 4 && frame.speedKph > 40 && frame.vehicleStatus !== 'on_trip') {
          alerts.push(this.raise(frame, 'possible_theft', ['movement in dead hours while not on a trip']));
        }

        // ── dangerous driving: strike model (3 harsh events in a window) ──
        const harsh = alerts.some((a) => ['sudden_braking', 'aggressive_acceleration', 'excessive_speed'].includes(a.type));
        if (harsh) {
          st.behaviorFlags++;
          if (st.behaviorFlags >= 3) {
            alerts.push(this.raise(frame, 'dangerous_driving', [`${st.behaviorFlags} harsh events in the last window`]));
            st.behaviorFlags = 0;
          }
        }
      }
    }

    st.prev = st.last; st.last = frame;
    st.history.push(frame);
    if (st.history.length > 500) st.history.shift();
    this.states.set(frame.vehicleId, st);

    // vehicle health bookkeeping
    const veh = this.vehicles.get(frame.vehicleId);
    if (veh && frame.healthScore !== undefined) veh.healthScore = frame.healthScore;
    if (veh && frame.fuelOrBatteryPct !== undefined) veh.fuelOrBatteryPct = frame.fuelOrBatteryPct;

    return alerts;
  }

  /** Snapshot of everything tracked (control-center feed). */
  snapshot() {
    return this.list().map((v) => {
      const st = this.states.get(v.id);
      return {
        vehicle: v,
        lastFrame: st?.last,
        moving: (st?.last?.speedKph ?? 0) > 3,
        alerts: this.alerts.filter((a) => a.vehicleId === v.id).slice(-5),
      };
    });
  }

  alertsFor(vehicleId?: string): MonitoringAlert[] { return vehicleId ? this.alerts.filter((a) => a.vehicleId === vehicleId) : [...this.alerts]; }

  private raise(frame: TelemetryFrame, type: MonitoringAlertType, evidence: string[]): MonitoringAlert {
    const a: MonitoringAlert = { id: `mon_${++this.seq}`, ts: frame.ts, vehicleId: frame.vehicleId, type, severity: SEVERITY_FOR[type], evidence };
    this.alerts.push(a);
    return a;
  }
}

/** Driver safety score from behaviour alerts (0-100; starts 100). */
export function driverScore(alerts: MonitoringAlert[], driverId: string, windowDays = 30): number {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const mine = alerts.filter((a) => a.ts.getTime() >= cutoff);
  void driverId;
  if (mine.length === 0) return 100;
  const penalty = mine.reduce((s, a) => s + (a.severity === 'critical' ? 22 : a.severity === 'high' ? 12 : a.severity === 'medium' ? 6 : 2), 0);
  return Math.max(0, 100 - penalty);
}
