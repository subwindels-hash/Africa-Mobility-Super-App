/**
 * MobilitySystem — the orchestrator tying vehicle intelligence, autonomy,
 * routing, fleet, pipelines, safety and security together WITH the platform:
 *
 *   FAMS       → every autonomous feature is activation-gated per
 *                country/state/city/road-zone/fleet/vehicle/vendor/mode
 *                (docs/28 integration — new levels road_zone|fleet|vehicle)
 *   SHIELD     → vehicle cybersecurity signals feed the defense swarm
 *                (docs/29 integration — 'vehicle' event category)
 *   ORGANISM   → telemetry enriches the shared intelligence graph
 *                (docs/30 integration — mobility observations)
 */

import {
  VehicleIntelligenceEngine, driverScore,
  type Vehicle, type TelemetryFrame, type MonitoringAlert, type OperatingMode,
} from './vehicles';
import { AutonomousDriveSystem, DriverAssistant, type SensorReading, type EnvironmentModel, type AssistContext, type AssistMessage } from './autonomy';
import { RouteIntelligence, FleetIntelligence, autonomousDeliveryPlan, autonomousRidePlan, SAFETY_RESPONSES, classifyVehicleSecurity, type RouteFactor, type RouteOption, type FleetRecommendation, type PipelineStep, type SafetyEventType } from './routing';

export interface FamsMobilityGate {
  /** FAMS decision for an autonomous-mobility feature in context. */
  allows(feature: 'mob.self_driving' | 'mob.autonomous_delivery' | 'mob.driver_assist' | 'mob.tracking' | 'mob.supervised_autonomy', ctx: MobilityContext): boolean;
}

export interface MobilityContext {
  country?: string; state?: string; city?: string; roadZone?: string;
  vendorId?: string; fleetId?: string; vehicleId?: string;
  userGroups?: string[]; userId?: string;
}

export interface ShieldMobilityBridge {
  /** Forward a vehicle security signal into the SHIELD detection engine. */
  reportVehicleSecurity(event: { principal?: string; vehicleId: string; signal: string; evidence: string[]; riskHints?: string[] }): unknown;
}

export interface OrganismMobilityBridge {
  observe(observation: { layer: string; subSwarm: string; node: string; signal: string; confidence: number; direction: 'up' | 'down' | 'flat' }): unknown;
}

export class MobilitySystem {
  readonly tracker = new VehicleIntelligenceEngine();
  readonly autonomy = new AutonomousDriveSystem();
  readonly assistant = new DriverAssistant();
  readonly routing = new RouteIntelligence();
  readonly fleet = new FleetIntelligence();

  constructor(
    private famsGate?: FamsMobilityGate,
    private shieldBridge?: ShieldMobilityBridge,
    private organismBridge?: OrganismMobilityBridge,
  ) {}

  // ── registration & telemetry ──
  registerVehicle(v: Parameters<VehicleIntelligenceEngine['register']>[0]): Vehicle { return this.tracker.register(v); }
  listVehicles(): Vehicle[] { return this.tracker.list(); }

  ingestTelemetry(frame: TelemetryFrame): { alerts: MonitoringAlert[]; gated: boolean } {
    const ctx: MobilityContext = { vehicleId: frame.vehicleId, roadZone: frame.roadZone };
    const trackingOn = !this.famsGate || this.famsGate.allows('mob.tracking', ctx);
    if (!trackingOn) return { alerts: [], gated: true };

    const alerts = this.tracker.ingest(frame);

    // SHIELD: telemetry-derived security signals (GPS spoofing, theft…)
    if (this.shieldBridge) {
      for (const a of alerts) {
        if (['gps_spoofing', 'possible_theft', 'unauthorized_usage'].includes(a.type)) {
          this.shieldBridge.reportVehicleSecurity({
            vehicleId: frame.vehicleId, principal: frame.vehicleId,
            signal: a.type, evidence: a.evidence,
            riskHints: a.type === 'gps_spoofing' ? ['gps_spoofing'] : ['vehicle_theft'],
          });
        }
      }
    }

    // ORGANISM: mobility feeds the shared intelligence graph
    this.organismBridge?.observe({
      layer: 'data_analysis', subSwarm: 'core_data',
      node: `vehicle:${frame.vehicleId}`,
      signal: `${frame.speedKph} km/h · ${frame.vehicleStatus ?? 'n/a'} · health ${frame.healthScore ?? '?'}`,
      confidence: 0.9, direction: frame.speedKph > 60 ? 'up' : 'flat',
    });

    return { alerts, gated: false };
  }

  // ── operating mode requests (FAMS + safety gated) ──
  requestMode(vehicle: Vehicle, mode: OperatingMode, env: EnvironmentModel, ctx: MobilityContext, legalApproval: boolean): {
    allowed: boolean; effectiveMode: OperatingMode; reason: string; actions: string[];
  } {
    const feature = mode === 'full_autonomous' ? 'mob.self_driving' : mode === 'supervised_autonomous' ? 'mob.supervised_autonomy' : mode === 'ai_assisted' ? 'mob.driver_assist' : 'mob.tracking';
    const famsAllowed = !this.famsGate || this.famsGate.allows(feature, ctx);
    const { gate, allowed, reason } = this.autonomy.evaluateModeGate(vehicle, mode, env, famsAllowed, legalApproval);
    if (!allowed) {
      return { allowed: false, effectiveMode: mode === 'manual' ? 'manual' : 'ai_assisted', reason: `mode blocked — ${reason} (gate: ${JSON.stringify(gate)})`, actions: ['fall back to human control'] };
    }
    const governed = this.autonomy.govern(mode, env);
    return { allowed: true, effectiveMode: governed.effectiveMode, reason, actions: governed.actions };
  }

  // ── pass-throughs ──
  understand(readings: SensorReading[]): EnvironmentModel { return this.autonomy.understandEnvironment(readings); }
  advise(ctx: AssistContext): AssistMessage[] { return this.assistant.advise(ctx); }
  route(factor: RouteFactor, candidates: Parameters<RouteIntelligence['recommend']>[1]): RouteOption[] { return this.routing.recommend(factor, candidates); }
  fleetAnalysis(stats: Parameters<FleetIntelligence['analyze']>[0]): ReturnType<FleetIntelligence['analyze']> { return this.fleet.analyze(stats); }
  deliveryPlan(opts: Parameters<typeof autonomousDeliveryPlan>[0]): { steps: PipelineStep[]; completed: boolean } { return autonomousDeliveryPlan(opts); }
  ridePlan(opts: Parameters<typeof autonomousRidePlan>[0]): { steps: PipelineStep[]; completed: boolean } { return autonomousRidePlan(opts); }
  safetyResponse(type: SafetyEventType, ctx: Parameters<typeof SAFETY_RESPONSES[SafetyEventType]>[0]) { return SAFETY_RESPONSES[type](ctx); }
  driverSafetyScore(alerts: MonitoringAlert[], driverId: string): number { return driverScore(alerts, driverId); }

  /** Vehicle command security check → SHIELD signal classification. */
  checkVehicleCommand(input: Parameters<typeof classifyVehicleSecurity>[0]): ReturnType<typeof classifyVehicleSecurity> {
    const signal = classifyVehicleSecurity(input);
    if (signal && this.shieldBridge) {
      this.shieldBridge.reportVehicleSecurity({
        vehicleId: input.principal ?? 'unknown-vehicle', principal: input.principal,
        signal, evidence: [`command: ${input.command ?? 'n/a'}`, `vinMatch: ${input.vinMatch ?? 'n/a'}`],
        riskHints: ['vehicle_command', signal],
      });
    }
    return signal;
  }

  /** Control-center snapshot (§14). */
  controlCenter() {
    return {
      vehicles: this.tracker.snapshot(),
      alerts: this.tracker.alertsFor().slice(-25),
      generatedAt: new Date().toISOString(),
    };
  }
}

export const MOBILITY_FEATURES = [
  { code: 'mob.tracking', label: 'AI Vehicle Tracking', spec: 'ON' },
  { code: 'mob.driver_assist', label: 'AI Driver Assistance', spec: 'ON' },
  { code: 'mob.self_driving', label: 'Self-Driving', spec: 'OFF — legal approval required' },
  { code: 'mob.autonomous_delivery', label: 'Autonomous Delivery', spec: 'OFF — regulatory clearance pending' },
  { code: 'mob.supervised_autonomy', label: 'Supervised Autonomy', spec: 'OFF outside approved corridors' },
] as const;
