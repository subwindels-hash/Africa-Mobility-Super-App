-- ============================================================================
-- MIGRATION 005 — FAMS expansion (spec v2: 24 global switches, granular
-- categories, 5-state vendor lifecycle, 8 asset classes, spec table names,
-- activation analytics).
--
-- ADDITIVE ONLY — nothing from migration 004 is removed:
--   1) spec-named location tables: country_services / state_services /
--      city_services (normalized views of activation per location scope)
--   2) activation_logs (spec name; fams.audit_log from 004 remains)
--   3) vendor lifecycle gains 'disabled'; asset classes gain dispatch bikes,
--      charter aircraft and yachts (spec list of 8)
--   4) category registry: dispatch / travel / security / aviation / marine
--      categories with independent switches
--   5) activation analytics view
-- ============================================================================

-- 1) Country-level activation (spec table)
CREATE TABLE fams.country_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
  service_code TEXT NOT NULL REFERENCES fams.services(code),
  value TEXT NOT NULL CHECK (value IN ('on','off','hidden','maintenance','beta')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  note TEXT,
  updated_by UUID,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, service_code)
);
CREATE INDEX idx_fams_country_svc ON fams.country_services(country_code, service_code);

-- 2) State-level activation (spec table)
CREATE TABLE fams.state_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL REFERENCES fams.states(code),
  service_code TEXT NOT NULL REFERENCES fams.services(code),
  value TEXT NOT NULL CHECK (value IN ('on','off','hidden','maintenance','beta')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  note TEXT,
  updated_by UUID,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (state_code, service_code)
);
CREATE INDEX idx_fams_state_svc ON fams.state_services(state_code, service_code);

-- 3) City-level activation (spec table)
CREATE TABLE fams.city_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_code TEXT NOT NULL REFERENCES geo.cities(code),
  service_code TEXT NOT NULL REFERENCES fams.services(code),
  value TEXT NOT NULL CHECK (value IN ('on','off','hidden','maintenance','beta')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  geofence JSONB,                                -- city-level geographic fence
  note TEXT,
  updated_by UUID,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_code, service_code)
);
CREATE INDEX idx_fams_city_svc ON fams.city_services(city_code, service_code);

-- 4) Activation logs (spec table; fams.audit_log stays for the 004 flows)
CREATE TABLE fams.activation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_role TEXT NOT NULL,                      -- super_admin | admin | scheduler | system
  action TEXT NOT NULL,                          -- activate | deactivate | hide | maintenance | schedule | emergency_stop | rollout
  scope TEXT NOT NULL,                           -- global | country | state | city | category | vendor | asset | user_group
  selector TEXT,                                 -- NG | NG-ED | NG-BNI | ride.vip | vnd_a | ast_jet_b | beta
  service_code TEXT NOT NULL REFERENCES fams.services(code),
  before_value TEXT,
  after_value TEXT,
  reason TEXT,
  request_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fams_act_logs_service ON fams.activation_logs(service_code, created_at DESC);
CREATE INDEX idx_fams_act_logs_actor ON fams.activation_logs(actor_id, created_at DESC);

-- 5) Vendor lifecycle: add 'disabled' (Active/Suspended/Pending Review/
--    Maintenance/Disabled per spec)
ALTER TABLE fams.vendor_activation DROP CONSTRAINT IF EXISTS vendor_activation_state_check;
ALTER TABLE fams.vendor_activation ADD CONSTRAINT vendor_activation_state_check
  CHECK (state IN ('active','suspended','pending_review','maintenance','disabled'));

-- 6) Asset classes: spec list — cars, motorcycles, dispatch bikes,
--    helicopters, private jets, charter aircraft, boats, yachts
ALTER TABLE fams.asset_activation DROP CONSTRAINT IF EXISTS asset_activation_asset_type_check;
ALTER TABLE fams.asset_activation ADD CONSTRAINT asset_activation_asset_type_check
  CHECK (asset_type IN ('car','vehicle','motorcycle','dispatch_bike','helicopter','private_jet','jet','charter_aircraft','boat','yacht'));

-- 7) New global switches in the service registry (24-item spec list)
INSERT INTO fams.services (code, kind, parent_code, name, icon, default_value, phase, sort_order) VALUES
  ('module.taxi','module','module.transportation','Taxi Services','🚕','on',1,12),
  ('module.dispatch','module','module.logistics','Dispatch Services','🛵','on',1,22),
  ('module.delivery','module','module.logistics','Delivery','📮','on',1,24),
  ('module.accommodation','module','module.accommodation','Accommodation','🏡','on',2,62),
  ('module.ai_features','module',NULL,'AI Features','🧠','on',1,142),
  ('module.video_calls','module',NULL,'Video Calls','📹','on',2,150),
  ('module.voice_calls','module',NULL,'Voice Calls','📞','on',1,155),
  ('module.chat','module',NULL,'Chat System','💬','on',1,158),
  ('feature.tracking.live','feature',NULL,'Live Tracking','🛰','on',1,60),
  ('feature.portal.corporate','feature',NULL,'Corporate Portal','🏢','on',1,70)
ON CONFLICT (code) DO NOTHING;

-- 8) Category registry — independent ON/OFF switches per spec families
INSERT INTO fams.services (code, kind, parent_code, name, icon, default_value, phase, sort_order) VALUES
  -- dispatch (Phase 1)
  ('dispatch.bike','category','vertical.logistics','Bike Dispatch','🛵','on',1,110),
  ('dispatch.courier','category','vertical.logistics','Courier','📇','on',1,120),
  ('dispatch.parcel','category','vertical.logistics','Parcel Delivery','📦','on',1,130),
  ('dispatch.document','category','vertical.logistics','Document Delivery','📄','on',1,140),
  -- travel (Phase 2)
  ('travel.domestic','category','vertical.travel','Domestic Flights','🛫','on',2,210),
  ('travel.international','category','vertical.travel','International Flights','🌍','on',2,220),
  ('hotel.booking','category','vertical.accommodation','Hotel Booking','🛎','on',2,230),
  -- security (Phase 3)
  ('security.exec_protection','category','vertical.security','Executive Protection Coordination','🛡','on',3,310),
  ('security.vip_escort','category','vertical.security','VIP Escort Coordination','👑','on',3,320),
  ('security.event','category','vertical.security','Event Security','🎪','on',3,330),
  ('security.corporate','category','vertical.security','Corporate Security','🏢','on',3,340),
  ('security.driver','category','vertical.security','Security Driver Services','🚙','on',3,350),
  -- aviation (Phase 4)
  ('aviation.heli','category','vertical.aviation','Helicopter Booking','🚁','on',4,410),
  ('aviation.jet','category','vertical.aviation','Private Jet Booking','🛄','on',4,420),
  ('aviation.charter','category','vertical.aviation','Charter Flights','✈️','on',4,430),
  ('aviation.air_ambulance','category','vertical.aviation','Air Ambulance','🚑','on',4,440),
  -- marine (Phase 5 — built, off until launch)
  ('marine.boat_charter','category','vertical.marine','Boat Charter','🚤','off',5,510),
  ('marine.yacht_charter','category','vertical.marine','Yacht Charter','🛥','off',5,520),
  ('marine.water_taxi','category','vertical.marine','Water Taxi','⛴','off',5,530)
ON CONFLICT (code) DO NOTHING;

-- 9) Same categories into the platform catalog (booking surfaces)
INSERT INTO platform.service_categories (vertical,code,name,booking_mode,price_model,sort_order) VALUES
  ('logistics','dispatch.bike','Bike Dispatch','instant','{"per_km":true}',15),
  ('logistics','dispatch.courier','Courier','same_day','{"per_item":true}',25),
  ('logistics','dispatch.parcel','Parcel Delivery','instant','{"per_km":true,"per_kg":true}',35),
  ('logistics','dispatch.document','Document Delivery','instant','{"flat":true}',45),
  ('travel','travel.domestic','Domestic Flights','search','{"gds":true}',15),
  ('travel','travel.international','International Flights','search','{"gds":true}',25),
  ('accommodation','hotel.booking','Hotel Booking','search','{"nightly":true}',15),
  ('security','security.exec_protection','Executive Protection Coordination','quote_based','{"agent_days":true}',15),
  ('security','security.vip_escort','VIP Escort Coordination','quote_based','{"agent_days":true}',25),
  ('security','security.event','Event Security','quote_based','{"event":true}',35),
  ('security','security.corporate','Corporate Security','quote_based','{"contract":true}',45),
  ('security','security.driver','Security Driver Services','scheduled','{"per_day":true}',55),
  ('aviation','aviation.heli','Helicopter Booking','quote_based','{"block_hours":true}',15),
  ('aviation','aviation.jet','Private Jet Booking','quote_based','{"block_hours":true}',25),
  ('aviation','aviation.charter','Charter Flights','quote_based','{"block_hours":true}',35),
  ('aviation','aviation.air_ambulance','Air Ambulance','quote_based','{"block_hours":true}',45),
  ('marine','marine.boat_charter','Boat Charter','quote_based','{"per_hour":true}',15),
  ('marine','marine.yacht_charter','Yacht Charter','quote_based','{"per_day":true}',25),
  ('marine','marine.water_taxi','Water Taxi','scheduled','{"per_trip":true}',35)
ON CONFLICT (code) DO NOTHING;

-- 10) Spec location examples (engine seed parity):
--     Ghana travel OFF · Edo travel OFF · Benin City security OFF · Asaba aviation OFF
INSERT INTO fams.country_services (country_code, service_code, value, note) VALUES
  ('GH','vertical.travel','off','Ghana GDS contracts pending'),
  ('KE','vertical.transportation','off','Kenya launch pending'),
  ('KE','vertical.logistics','off','Kenya launch pending'),
  ('GH','vertical.security','off','Ghana security pending licensing')
ON CONFLICT (country_code, service_code) DO NOTHING;

INSERT INTO fams.state_services (state_code, service_code, value, note) VALUES
  ('NG-ED','vertical.aviation','off','NCAA ops clearance pending in Edo'),
  ('NG-ED','vertical.travel','off','Edo travel pending OTA licensing')
ON CONFLICT (state_code, service_code) DO NOTHING;

INSERT INTO fams.city_services (city_code, service_code, value, note) VALUES
  ('NG-BNI','vertical.security','off','Benin City security licensing'),
  ('NG-ASB','vertical.aviation','off','Asaba airspace restrictions')
ON CONFLICT (city_code, service_code) DO NOTHING;

-- 11) Activation analytics view (10th dashboard module)
CREATE OR REPLACE VIEW fams.v_activation_analytics AS
SELECT s.code AS service_code, s.name AS service_name, s.kind,
       COALESCE(cs.active_countries, 0) AS countries_on,
       COALESCE(ss.active_states, 0) AS states_on,
       COALESCE(cis.active_cities, 0) AS cities_on,
       EXISTS (SELECT 1 FROM fams.emergency_stops es
               WHERE es.target_key IN (s.code, 'module:' || split_part(s.code, '.', 1))
                 AND es.cleared_at IS NULL) AS emergency_stopped
FROM fams.services s
LEFT JOIN (SELECT service_code, COUNT(*) AS active_countries FROM fams.country_services WHERE value IN ('on','beta') GROUP BY service_code) cs ON cs.service_code = s.code
LEFT JOIN (SELECT service_code, COUNT(*) AS active_states FROM fams.state_services WHERE value IN ('on','beta') GROUP BY service_code) ss ON ss.service_code = s.code
LEFT JOIN (SELECT service_code, COUNT(*) AS active_cities FROM fams.city_services WHERE value IN ('on','beta') GROUP BY service_code) cis ON cis.service_code = s.code
ORDER BY s.kind, s.sort_order;
