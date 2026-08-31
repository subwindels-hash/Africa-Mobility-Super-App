/**
 * AUTONOMOUS AI MOBILITY — engine tests (docs/31).
 * Tracking/intelligence, autonomy gates + safety governor (§16 contract),
 * vehicle-aware routing, fleet intelligence, pipelines, safety, vehicle cyber,
 * and FAMS integration (road-zone / fleet / vehicle levels).
 */
import { describe, expect, it } from 'vitest';
import {
  MobilitySystem, VEHICLE_CLASSES, OPERATING_MODES, ENVIRONMENT_OBJECTS, SENSOR_SOURCES,
  SAFETY_PRIORITY, MOBILITY_FEATURES, COMMAND_AUTH_MODEL,
  type TelemetryFrame, type SensorReading, type Vehicle, type OperatingMode,
} from '../libs/mobility/src/index';
import { FamsEngine, seedFams, type FamsContext } from '../libs/fams/src/index';

const fams = new FamsEngine();
seedFams(fams, 4);
const system = new MobilitySystem(
  { allows: (feature, ctx) => fams.evaluate('feature', feature, ctx as FamsContext).available },
);

const av = (over: Partial<Vehicle> = {}): Vehicle => system.registerVehicle({
  id: 'av_1', code: 'AV-001', cls: 'autonomous_vehicle', autonomyLevel: 4,
  modesSupported: ['manual', 'ai_assisted', 'supervised_autonomous', 'full_autonomous'],
  status: 'active', telematics: true, ...over,
} as any);

function frame(over: Partial<TelemetryFrame> = {}): TelemetryFrame {
  return { vehicleId: 'av_1', ts: new Date(), lat: 6.42, lng: 3.42, speedKph: 40, headingDeg: 45, ...over };
}

function readings(live: SensorSource0[] = ['gps', 'camera', 'lidar'], statics: SensorSource0[] = ['hd_maps']): SensorReading[] {
  const mk = (source: SensorSource0): SensorReading => ({
    source, ts: new Date(),
    objects: { road: 0.95, vehicle: 0.9, pedestrian: 0.3, speed_limit: 0.9 },
    agreesWithPosition: true,
  });
  return [...live, ...statics].map(mk);
}
type SensorSource0 = SensorReading['source'];

describe('AI vehicle tracking (§1)', () => {
  it('supports every asset class incl. trucks, buses, AVs and future aircraft/marine', () => {
    const classes = VEHICLE_CLASSES.map((c) => c.cls);
    expect(classes).toEqual(expect.arrayContaining(['car', 'taxi', 'suv', 'chauffeur', 'delivery_bike', 'motorcycle', 'truck', 'bus', 'autonomous_vehicle', 'aircraft', 'marine']));
    expect(VEHICLE_CLASSES.find((c) => c.cls === 'truck')!.roadAccess).toEqual(['primary', 'truck_route']);
    expect(VEHICLE_CLASSES.find((c) => c.cls === 'motorcycle')!.roadAccess).toContain('narrow');
  });

  it('streams live telemetry: GPS, speed, heading, destination, driver/vehicle status', () => {
    av();
    const { alerts, gated } = system.ingestTelemetry(frame({ destination: { lat: 6.6, lng: 3.35 }, driverStatus: 'active', vehicleStatus: 'on_trip', fuelOrBatteryPct: 78, healthScore: 92 }));
    expect(gated).toBe(false);
    expect(alerts).toHaveLength(0);                 // healthy frame → no alerts
    const snap = system.controlCenter();
    const me = snap.vehicles.find((v) => v.vehicle.id === 'av_1')!;
    expect(me.lastFrame.speedKph).toBe(40);
    expect(me.vehicle.fuelOrBatteryPct).toBe(78);   // telemetry updates vehicle state
  });

  it('flags excessive speed, harsh braking/acceleration and dangerous driving', () => {
    av();
    system.ingestTelemetry(frame({ ts: new Date('2026-08-31T10:00:00Z'), speedKph: 30 }));
    system.ingestTelemetry(frame({ ts: new Date('2026-08-31T10:00:01Z'), speedKph: 130 }));  // excessive speed
    const { alerts } = system.ingestTelemetry(frame({ ts: new Date('2026-08-31T10:00:02Z'), speedKph: 10 })); // harsh brake
    const types = system.tracker.alertsFor('av_1').map((a) => a.type);
    expect(types).toContain('excessive_speed');
    expect(alerts.map((a) => a.type)).toContain('sudden_braking');
  });

  it('detects GPS spoofing (impossible movement) and routes it to SHIELD', () => {
    const shieldEvents: string[] = [];
    const sys = new MobilitySystem(undefined, { reportVehicleSecurity: (e) => shieldEvents.push(e.signal) });
    sys.registerVehicle({ id: 'v9', code: 'T-009', cls: 'taxi', autonomyLevel: 0, modesSupported: ['manual'], status: 'active', telematics: true } as any);
    sys.ingestTelemetry({ vehicleId: 'v9', ts: new Date('2026-08-31T10:00:00Z'), lat: 6.42, lng: 3.42, speedKph: 20, headingDeg: 0 });
    const { alerts } = sys.ingestTelemetry({ vehicleId: 'v9', ts: new Date('2026-08-31T10:00:10Z'), lat: 7.9, lng: 5.9, speedKph: 20, headingDeg: 0 }); // ~200km in 10s
    expect(alerts.map((a) => a.type)).toContain('gps_spoofing');
    expect(shieldEvents).toContain('gps_spoofing');
  });

  it('detects unexpected/suspicious stops and route deviations', () => {
    const sys = new MobilitySystem();
    sys.registerVehicle({ id: 'v8', code: 'C-008', cls: 'car', autonomyLevel: 0, modesSupported: ['manual'], status: 'active', telematics: true } as any);
    const dest = { lat: 6.6, lng: 3.35 };
    // moving toward destination, then stops unplanned for 12 min
    sys.ingestTelemetry({ vehicleId: 'v8', ts: new Date('2026-08-31T10:00:00Z'), lat: 6.42, lng: 3.42, speedKph: 30, headingDeg: 0, destination: dest, routeId: 'r1', driverStatus: 'active' });
    sys.ingestTelemetry({ vehicleId: 'v8', ts: new Date('2026-08-31T10:06:00Z'), lat: 6.50, lng: 3.38, speedKph: 0, headingDeg: 0, destination: dest, routeId: 'r1', driverStatus: 'active', vehicleStatus: 'idle' });
    const { alerts } = sys.ingestTelemetry({ vehicleId: 'v8', ts: new Date('2026-08-31T10:19:00Z'), lat: 6.50, lng: 3.38, speedKph: 0, headingDeg: 0, destination: dest, routeId: 'r1', driverStatus: 'active', vehicleStatus: 'idle' });
    expect(alerts.map((a) => a.type)).toContain('suspicious_stop');
    // deviation: driving away from destination
    const away = sys.ingestTelemetry({ vehicleId: 'v8', ts: new Date('2026-08-31T10:25:00Z'), lat: 6.30, lng: 3.30, speedKph: 45, headingDeg: 180, destination: dest, routeId: 'r1', driverStatus: 'active' });
    expect(away.alerts.map((a) => a.type)).toContain('route_deviation');
  });
});

describe('AI vehicle intelligence (§2) & driver score', () => {
  it('driver safety score degrades with harsh events and recovers over time', () => {
    const sys = new MobilitySystem();
    const alerts = [
      { id: '1', ts: new Date(), vehicleId: 'v1', type: 'sudden_braking' as const, severity: 'medium' as const, evidence: [] },
      { id: '2', ts: new Date(), vehicleId: 'v1', type: 'excessive_speed' as const, severity: 'high' as const, evidence: [] },
    ];
    expect(sys.driverSafetyScore(alerts, 'drv_1')).toBeLessThan(100);
    expect(sys.driverSafetyScore([], 'drv_1')).toBe(100);
  });
});

describe('AI driver assistance (§3)', () => {
  it('advises on speed, traffic, hazards, weather, fatigue and health via voice/dashboard/mobile', () => {
    const msgs = system.advise({
      speedKph: 95, speedLimitKph: 80, trafficLevel: 'heavy', weather: 'rain',
      roadHazard: 'broken-down truck', hoursDriving: 5, vehicleHealth: 45, etaMin: 18, laneGuidanceSupported: true,
    });
    const channels = msgs.map((m) => m.channel);
    expect(channels).toEqual(expect.arrayContaining(['voice', 'dashboard', 'mobile']));
    expect(msgs.some((m) => /over the limit/i.test(m.text))).toBe(true);
    expect(msgs.some((m) => /rest break/i.test(m.text))).toBe(true);
    expect(msgs.some((m) => /following distance/i.test(m.text))).toBe(true);
  });
});

describe('AI self-driving architecture (§4–7, §16 safety contract)', () => {
  it('fuses ALL sensor classes and never trusts a single source', () => {
    expect(Object.keys(SENSOR_SOURCES)).toHaveLength(12);
    expect(SENSOR_SOURCES.hd_maps.live).toBe(false);
    expect(SENSOR_SOURCES.street_imagery.weight).toBeLessThan(0.5);   // imagery alone is weak
    const env = system.understand(readings());
    expect(env.liveSourceCount).toBe(3);
    expect(env.positionConfidence).toBeGreaterThan(0.7);
  });

  it('static sources alone can NEVER yield autonomy-grade confidence (§16)', () => {
    const mapsOnly = system.understand(readings([], ['hd_maps', 'digital_maps', 'street_imagery']));
    expect(mapsOnly.liveSourceCount).toBe(0);
    expect(mapsOnly.positionConfidence).toBeLessThan(0.5);
    const governed = system.autonomy.govern('full_autonomous', mapsOnly);
    expect(governed.effectiveMode).not.toBe('full_autonomous');        // downgraded, not trusted
  });

  it('understands every spec environment object', () => {
    expect(ENVIRONMENT_OBJECTS).toEqual(expect.arrayContaining(['traffic_light', 'stop_sign', 'lane_marking', 'pedestrian', 'construction_zone', 'bridge', 'tunnel', 'parking_area']));
  });

  it('mode gates: full autonomy requires vehicle + tech + environment + law + safety', () => {
    const v = av();
    const env = system.understand(readings());
    const allOk = system.requestMode(v, 'full_autonomous', env, {}, true);
    expect(allOk.allowed).toBe(false);                                 // FAMS: self-driving OFF by default
    expect(allOk.reason).toContain('safetyValidated');
    // legal approval missing too
    const noLaw = system.requestMode(v, 'full_autonomous', env, {}, false);
    expect(noLaw.allowed).toBe(false);
    expect(noLaw.reason).toContain('legalApproval');
    // L2 vehicle can never go full autonomous
    const l2 = av({ id: 'av_l2', autonomyLevel: 2, modesSupported: ['manual', 'ai_assisted'] });
    expect(system.requestMode(l2, 'full_autonomous', env, {}, true).allowed).toBe(false);
  });

  it('supervised autonomy works in the approved pilot road zone, off elsewhere (FAMS road_zone level)', () => {
    const v = av({ id: 'av_2', autonomyLevel: 3, modesSupported: ['manual', 'ai_assisted', 'supervised_autonomous'] });
    const env = system.understand(readings());
    const inZone = system.requestMode(v, 'supervised_autonomous', env, { roadZone: 'zone:NG-LAG-EKO-ATLANTIC', country: 'NG' }, true);
    expect(inZone.allowed).toBe(true);
    const outside = system.requestMode(v, 'supervised_autonomous', env, { roadZone: 'zone:NG-IBD-CENTRAL', country: 'NG' }, true);
    expect(outside.allowed).toBe(false);
  });

  it('operating modes cover the spec four; safety priority order is fixed', () => {
    expect(Object.keys(OPERATING_MODES)).toEqual(['manual', 'ai_assisted', 'supervised_autonomous', 'full_autonomous']);
    expect(SAFETY_PRIORITY[0]).toContain('Human safety');
    expect(SAFETY_PRIORITY[1]).toContain('Regulatory compliance');
  });
});

describe('route intelligence (§8) — vehicle-class aware', () => {
  const candidates = [
    { id: 'r_third-mainland', via: 'Third Mainland Bridge', distanceKm: 18, baseEtaMin: 26, roadTypes: ['primary'] },
    { id: 'r_inner-streets', via: 'Inner streets', distanceKm: 14, baseEtaMin: 30, roadTypes: ['primary', 'secondary', 'narrow'] },
    { id: 'r_truck-bypass', via: 'Truck bypass', distanceKm: 24, baseEtaMin: 34, roadTypes: ['primary', 'truck_route'] },
    { id: 'r_av-corridor', via: 'AV corridor (Eko Atlantic)', distanceKm: 20, baseEtaMin: 28, roadTypes: ['primary', 'av_mapped'] },
  ];

  it('motorcycle gets narrow-street routing; truck gets truck routes; AV prefers AV-mapped', () => {
    const bike = system.route({ distanceKm: 14, traffic: 'moderate', roadQuality: 'fair', weather: 'clear', vehicle: system.registerVehicle({ id: 'b1', code: 'B-1', cls: 'motorcycle', autonomyLevel: 0, modesSupported: ['manual'], status: 'active', telematics: false } as any), requirement: 'fast_delivery' }, candidates)[0];
    expect(bike.via).toBe('Inner streets');
    const truck = system.route({ distanceKm: 24, traffic: 'free', roadQuality: 'good', weather: 'clear', vehicle: system.registerVehicle({ id: 't1', code: 'T-1', cls: 'truck', autonomyLevel: 0, modesSupported: ['manual'], status: 'active', telematics: true } as any), requirement: 'heavy_load', load: { weightKg: 3000 } }, candidates)[0];
    expect(truck.via).toBe('Truck bypass');
    const avV = av();
    const avRoute = system.route({ distanceKm: 20, traffic: 'moderate', roadQuality: 'good', weather: 'clear', vehicle: avV }, candidates)[0];
    expect(avRoute.via).toContain('AV corridor');
    expect(avRoute.autonomousSupported).toBe(true);
  });

  it('storm riding is strongly discouraged for motorcycles', () => {
    const ranked = system.route({ distanceKm: 14, traffic: 'free', roadQuality: 'good', weather: 'storm', vehicle: system.tracker.get('b1')! }, candidates);
    expect(ranked[0].reasons.join(' ')).toMatch(/storm/i);
  });
});

describe('fleet intelligence (§9)', () => {
  it('emits maintenance, replacement, allocation, positioning and cost recommendations', () => {
    const mk = (id: string, health: number, util: number, rev: number, evts = 0): any => ({
      vehicle: system.registerVehicle({ id, code: id.toUpperCase(), cls: 'car', autonomyLevel: 0, modesSupported: ['manual'], status: 'active', telematics: true, healthScore: health } as any),
      utilizationPct: util, revenueMinor30d: rev, fuelOrEnergyUse: 2.5, safetyEvents30d: evts, routeEfficiencyPct: 55,
      maintenanceDueInKm: health < 55 ? 200 : 20000,
    });
    const { recommendations, fleetSummary } = system.fleetAnalysis([mk('f1', 35, 20, 1_000_000), mk('f2', 90, 90, 9_000_000), mk('f3', 70, 10, 500_000, 4)]);
    const kinds = recommendations.map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(['maintenance_alert', 'replacement', 'allocation', 'positioning', 'cost_reduction']));
    expect(fleetSummary.vehicles).toBe(3);
  });
});

describe('autonomous pipelines (§10–11)', () => {
  it('delivery pipeline follows the spec flow and blocks when FAMS disallows autonomy', () => {
    const ok = system.deliveryPlan({ allowed: false, vehicleAssigned: true, routeFound: true, autonomous: false, tracked: true, confirmed: true });
    expect(ok.completed).toBe(true);                                    // human-operated path works
    expect(ok.steps.map((s) => s.step)).toEqual(['Customer request', 'AI delivery planning', 'Vehicle assignment', 'Route planning', 'Human-operated delivery', 'Real-time tracking', 'Delivery confirmation']);
    const blocked = system.deliveryPlan({ allowed: false, vehicleAssigned: true, routeFound: true, autonomous: true, tracked: true, confirmed: true });
    expect(blocked.completed).toBe(false);
    expect(blocked.steps.find((s) => s.step === 'Autonomous delivery')!.detail).toContain('NOT activated');
  });

  it('ride pipeline: 9 spec steps incl. fallback when autonomy is blocked', () => {
    const ok = system.ridePlan({ matched: true, avAssigned: true, allowed: false, pickup: true, trip: true, arrived: true, paid: true });
    expect(ok.completed).toBe(true);
    expect(ok.steps.find((s) => s.step === 'Trip')!.detail).toContain('human drive fallback');
    expect(ok.steps).toHaveLength(9);
  });
});

describe('vehicle safety system (§12)', () => {
  it('passenger emergency alerts everyone, triggers emergency workflow and can immobilize only where legal', () => {
    const r = system.safetyResponse('passenger_emergency', { severity: 0.95, immobilizeSupported: true, legallyPermitted: true });
    expect(r.workflow).toBe('emergency_workflow');
    expect(r.alerts).toEqual(expect.arrayContaining(['passengers', 'fleet_operators', 'emergency_contacts']));
    expect(r.immobilize).toBe(true);
    const illegal = system.safetyResponse('passenger_emergency', { severity: 0.95, immobilizeSupported: true, legallyPermitted: false });
    expect(illegal.immobilize).toBe(false);                             // never where not permitted
  });

  it('collision risk scales alerts with severity; unusual movement can trigger safe stop', () => {
    const low = system.safetyResponse('collision_risk', { severity: 0.4, immobilizeSupported: false, legallyPermitted: false });
    expect(low.alerts).toEqual(['driver']);
    const high = system.safetyResponse('unusual_movement', { severity: 0.9, immobilizeSupported: false, legallyPermitted: false });
    expect(high.workflow).toBe('safe_stop');
  });
});

describe('vehicle cybersecurity (§13)', () => {
  it('classifies malicious commands, unauthorized access, sensor manipulation and identity fraud → SHIELD', () => {
    const shieldSignals: string[] = [];
    const sys = new MobilitySystem(undefined, { reportVehicleSecurity: (e) => shieldSignals.push(e.signal) });
    expect(sys.checkVehicleCommand({ command: 'disable_brakes', principal: 'ops_1', authorizedPrincipals: ['ops_1'] })).toBe('malicious_command');
    expect(sys.checkVehicleCommand({ command: 'door_unlock', principal: 'stranger', authorizedPrincipals: ['ops_1'], remoteAccess: true })).toBe('unauthorized_remote_access');
    expect(sys.checkVehicleCommand({ command: 'start', sensorContradiction: true })).toBe('sensor_manipulation');
    expect(sys.checkVehicleCommand({ command: 'start', vinMatch: false })).toBe('vehicle_identity_fraud');
    expect(shieldSignals).toHaveLength(4);                              // all reported to SHIELD
    expect(COMMAND_AUTH_MODEL.authentication).toContain('mutual TLS');
  });
});

describe('FAMS activation control (§15) & feature catalog', () => {
  it('spec example states: tracking ON, driver-assist ON, self-driving OFF, autonomous delivery OFF', () => {
    expect(MOBILITY_FEATURES.find((f) => f.code === 'mob.tracking')!.spec).toContain('ON');
    expect(MOBILITY_FEATURES.find((f) => f.code === 'mob.self_driving')!.spec).toContain('OFF');
    const ctx: FamsContext = { country: 'NG', userGroups: ['customers'] };
    expect(fams.evaluate('feature', 'mob.tracking', ctx).available).toBe(true);
    expect(fams.evaluate('feature', 'mob.driver_assist', ctx).available).toBe(true);
    expect(fams.evaluate('feature', 'mob.self_driving', ctx).available).toBe(false);
    expect(fams.evaluate('feature', 'mob.autonomous_delivery', ctx).available).toBe(false);
  });

  it('new control levels: vehicle-level and fleet-level rules beat city-level', () => {
    const e = new FamsEngine();
    seedFams(e, 4);
    e.upsertRule({ level: 'city', selector: 'NG-LAG', target: { kind: 'feature', code: 'mob.driver_assist' }, value: 'off', note: 'city pause' });
    e.upsertRule({ level: 'vehicle', selector: 'veh_vip', target: { kind: 'feature', code: 'mob.driver_assist' }, value: 'on', note: 'vehicle override' });
    const city = e.evaluate('feature', 'mob.driver_assist', { country: 'NG', city: 'NG-LAG', userGroups: ['customers'] });
    expect(city.available).toBe(false);
    const veh = e.evaluate('feature', 'mob.driver_assist', { country: 'NG', city: 'NG-LAG', vehicleId: 'veh_vip', userGroups: ['customers'] });
    expect(veh.available).toBe(true);                                   // vehicle (75) beats city (40)
    const fleetRule = e.upsertRule({ level: 'fleet', selector: 'flt_1', target: { kind: 'feature', code: 'mob.driver_assist' }, value: 'off' });
    expect(fleetRule.level).toBe('fleet');
  });

  it('telemetry ingestion is gated by FAMS tracking feature', () => {
    const e = new FamsEngine();
    seedFams(e, 4);
    e.setEmergency('feature:mob.tracking', true, 'test', 'tracking kill');
    const sys = new MobilitySystem({ allows: (f, ctx) => e.evaluate('feature', f, ctx as FamsContext).available });
    sys.registerVehicle({ id: 'g1', code: 'G-1', cls: 'car', autonomyLevel: 0, modesSupported: ['manual'], status: 'active', telematics: true } as any);
    const out = sys.ingestTelemetry({ vehicleId: 'g1', ts: new Date(), lat: 6.4, lng: 3.4, speedKph: 40, headingDeg: 0 });
    expect(out.gated).toBe(true);                                       // kill switch stops tracking platform-wide
  });
});
