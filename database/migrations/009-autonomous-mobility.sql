-- ============================================================================
-- MIGRATION 009 — AUTONOMOUS AI MOBILITY (docs/31): vehicle tracking &
-- intelligence, driver assistance, autonomy modes, vehicle-aware routing,
-- fleet intelligence, autonomous pipelines, safety and vehicle cybersecurity.
--
-- Integrates with: telemetry.positions (001), fams.* (004/005 — level CHECKs
-- extended with road_zone|fleet|vehicle), shield.* (007 — 'vehicle' events).
-- ============================================================================

-- 0) FAMS: extend activation levels with road-zone / fleet / vehicle scope
ALTER TABLE fams.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_level_check;
ALTER TABLE fams.feature_flags ADD CONSTRAINT feature_flags_level_check
  CHECK (level IN ('global','country','state','city','road_zone','category','vendor','fleet','vehicle','asset'));
ALTER TABLE fams.service_availability DROP CONSTRAINT IF EXISTS service_availability_level_check;
ALTER TABLE fams.service_availability ADD CONSTRAINT service_availability_level_check
  CHECK (level IN ('global','country','state','city','road_zone'));
ALTER TABLE fams.scheduled_activations DROP CONSTRAINT IF EXISTS scheduled_activations_level_check;
ALTER TABLE fams.scheduled_activations ADD CONSTRAINT scheduled_activations_level_check
  CHECK (level IN ('global','country','state','city','road_zone','category','vendor','fleet','vehicle','asset'));

CREATE SCHEMA IF NOT EXISTS mobility;

-- 1) Fleets (fleet-level activation + fleet intelligence grouping)
CREATE TABLE mobility.fleets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                    -- flt_1
  name TEXT NOT NULL,
  owner_vendor_id UUID REFERENCES vendor.vendors(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Vehicles — every asset class, incl. future aircraft & marine
CREATE TABLE mobility.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                    -- AV-001
  cls TEXT NOT NULL CHECK (cls IN ('car','taxi','suv','chauffeur','delivery_bike','motorcycle','truck','bus','autonomous_vehicle','aircraft','marine')),
  fleet_id UUID REFERENCES mobility.fleets(id),
  vendor_id UUID REFERENCES vendor.vendors(id),
  asset_id UUID REFERENCES vendor.assets(id),
  autonomy_level INT NOT NULL DEFAULT 0 CHECK (autonomy_level BETWEEN 0 AND 5),  -- SAE J3016
  modes_supported TEXT[] NOT NULL DEFAULT '{manual}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','offline','retired')),
  health_score INT NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  telematics BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mobility_vehicles_fleet ON mobility.vehicles(fleet_id);
CREATE INDEX idx_mobility_vehicles_cls ON mobility.vehicles(cls, status);

-- 3) Telemetry frames (Timescale hypertable candidate alongside telemetry.positions)
CREATE TABLE mobility.vehicle_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  vehicle_id UUID NOT NULL REFERENCES mobility.vehicles(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed_kph NUMERIC(6,2),
  heading_deg NUMERIC(5,1),
  route_id TEXT,
  destination JSONB,
  driver_status TEXT CHECK (driver_status IN ('active','idle','on_break','resting','offline','none')),
  vehicle_status TEXT CHECK (vehicle_status IN ('on_trip','idle','charging','maintenance','offline')),
  engine_on BOOLEAN,
  fuel_or_battery_pct NUMERIC(5,2),
  health_score INT,
  road_zone TEXT,                               -- zone:NG-LAG-EKO-ATLANTIC (road-zone activation)
  meta JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_mobility_tel_vehicle ON mobility.vehicle_telemetry(vehicle_id, ts DESC);
CREATE INDEX idx_mobility_tel_ts ON mobility.vehicle_telemetry(ts DESC);

-- 4) Monitoring & behaviour alerts (route deviation, stops, geofence, harsh events…)
CREATE TABLE mobility.vehicle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  vehicle_id UUID NOT NULL REFERENCES mobility.vehicles(id),
  type TEXT NOT NULL CHECK (type IN ('route_deviation','unexpected_stop','geofence_violation','excessive_speed','sudden_braking','aggressive_acceleration','dangerous_driving','suspicious_stop','possible_theft','gps_spoofing','unauthorized_usage','possible_accident')),
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  evidence TEXT[] NOT NULL DEFAULT '{}',
  reviewed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_mobility_events_vehicle ON mobility.vehicle_events(vehicle_id, ts DESC);

-- 5) Driver safety scores (behaviour analytics)
CREATE TABLE mobility.driver_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES identity.users(id),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  window_days INT NOT NULL DEFAULT 30,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mobility_driver_scores ON mobility.driver_scores(driver_id, computed_at DESC);

-- 6) Autonomy sessions (operating-mode lifecycle + supervision)
CREATE TABLE mobility.autonomy_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES mobility.vehicles(id),
  requested_mode TEXT NOT NULL CHECK (requested_mode IN ('manual','ai_assisted','supervised_autonomous','full_autonomous')),
  effective_mode TEXT NOT NULL CHECK (effective_mode IN ('manual','ai_assisted','supervised_autonomous','full_autonomous')),
  gate_result JSONB NOT NULL DEFAULT '{}',      -- vehicleSupports/technology/environment/legal/safety
  supervisor_id UUID REFERENCES identity.users(id),
  disengagements INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX idx_mobility_sessions_vehicle ON mobility.autonomy_sessions(vehicle_id, started_at DESC);

-- 7) Route intelligence (multi-factor, vehicle-class aware)
CREATE TABLE mobility.route_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES mobility.vehicles(id),
  booking_id UUID,
  factors JSONB NOT NULL DEFAULT '{}',          -- traffic/roadQuality/weather/security/load/requirement
  options JSONB NOT NULL DEFAULT '[]',          -- scored candidates + reasons
  selected_route TEXT,
  autonomous_supported BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8) Autonomous trips (ride-hailing pipeline)
CREATE TABLE mobility.autonomous_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID,
  vehicle_id UUID NOT NULL REFERENCES mobility.vehicles(id),
  mode TEXT NOT NULL CHECK (mode IN ('manual','ai_assisted','supervised_autonomous','full_autonomous')),
  pipeline JSONB NOT NULL DEFAULT '[]',         -- 9-step flow state
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_to_human BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9) Autonomous deliveries (delivery pipeline)
CREATE TABLE mobility.autonomous_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID,
  vehicle_id UUID REFERENCES mobility.vehicles(id),
  autonomous BOOLEAN NOT NULL DEFAULT FALSE,
  pipeline JSONB NOT NULL DEFAULT '[]',         -- 7-step flow state
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_by_fams BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10) Safety events & responses
CREATE TABLE mobility.safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  vehicle_id UUID REFERENCES mobility.vehicles(id),
  type TEXT NOT NULL CHECK (type IN ('collision_risk','dangerous_road','vehicle_failure','driver_emergency','passenger_emergency','unusual_movement')),
  severity NUMERIC(3,2) NOT NULL CHECK (severity BETWEEN 0 AND 1),
  response JSONB NOT NULL DEFAULT '{}',         -- alerts/workflow/immobilize/escalation
  immobilized BOOLEAN NOT NULL DEFAULT FALSE,   -- only where supported AND legally permitted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mobility_safety_ts ON mobility.safety_events(ts DESC);

-- 11) Vehicle command audit (cybersecurity — signed, authorized commands only)
CREATE TABLE mobility.vehicle_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  vehicle_id UUID REFERENCES mobility.vehicles(id),
  principal TEXT NOT NULL,
  command TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  signal TEXT CHECK (signal IN ('gps_spoofing','unauthorized_remote_access','communication_attack','malicious_command','sensor_manipulation','vehicle_identity_fraud')),
  shield_threat UUID,                           -- link to shield.threats when escalated
  auth_model JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_mobility_commands_vehicle ON mobility.vehicle_commands(vehicle_id, ts DESC);

-- 12) Road zones (sub-city activation scope + geofence)
CREATE TABLE mobility.road_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                    -- zone:NG-LAG-EKO-ATLANTIC
  name TEXT NOT NULL,
  city_code TEXT REFERENCES geo.cities(code),
  boundary GEOMETRY(Polygon, 4326),
  av_mapped BOOLEAN NOT NULL DEFAULT FALSE,     -- validated AV corridor
  supervised_autonomy_pilot BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mobility_zones_geom ON mobility.road_zones USING GIST(boundary);

-- Seed: FAMS autonomous-mobility features (spec §15 examples)
INSERT INTO fams.services (code, kind, parent_code, name, icon, default_value, phase, sort_order) VALUES
  ('feature.mob.tracking','feature',NULL,'AI Vehicle Tracking','📡','on',1,80),
  ('feature.mob.driver_assist','feature',NULL,'AI Driver Assistance','🧭','on',1,85),
  ('feature.mob.self_driving','feature',NULL,'Self-Driving','🤖','off',5,90),
  ('feature.mob.autonomous_delivery','feature',NULL,'Autonomous Delivery','📦','off',5,95),
  ('feature.mob.supervised_autonomy','feature',NULL,'Supervised Autonomy','👀','off',4,87)
ON CONFLICT (code) DO NOTHING;

INSERT INTO fams.feature_flags (service_code, level, selector, value, note) VALUES
  ('feature.mob.self_driving','global',NULL,'off','Requires legal approval per jurisdiction — never default-on'),
  ('feature.mob.autonomous_delivery','global',NULL,'off','Regulatory clearance pending'),
  ('feature.mob.driver_assist','global',NULL,'on','AI driver assistance available'),
  ('feature.mob.tracking','global',NULL,'on','AI vehicle tracking live'),
  ('feature.mob.supervised_autonomy','global',NULL,'off','OFF outside approved corridors'),
  ('feature.mob.supervised_autonomy','road_zone','zone:NG-LAG-EKO-ATLANTIC','on','Supervised-autonomy pilot corridor')
ON CONFLICT DO NOTHING;

-- Seed: the pilot road zone
INSERT INTO mobility.road_zones (code, name, city_code, av_mapped, supervised_autonomy_pilot) VALUES
  ('zone:NG-LAG-EKO-ATLANTIC','Eko Atlantic AV Corridor','NG-LAG',TRUE,TRUE)
ON CONFLICT (code) DO NOTHING;
