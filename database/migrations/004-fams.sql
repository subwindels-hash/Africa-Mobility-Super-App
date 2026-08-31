-- ============================================================================
-- MIGRATION 004 — FAMS: Feature Activation Management System (docs/28)
-- Centralized activation control: admins activate / deactivate / hide /
-- gradually roll out services, locations, features, vendors and assets
-- WITHOUT software updates or code changes.
--
-- Spec tables (10): services, states, feature_flags, service_availability,
-- feature_rollouts, vendor_activation, asset_activation,
-- scheduled_activations (+ emergency_stops, audit_log).
-- geo.countries / geo.cities already exist since 001 and are reused for
-- country/city control; fams.states adds the state layer.
-- Engine semantics (backend/libs/fams): precedence
--   asset(70) > vendor(60) > category(50) > city(40) > state(30) >
--   country(20) > global(10), +15 for user-group-scoped rules; most recent
--   decision wins ties; kill switch overrides everything.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS fams;

-- 1) Service registry — every platform module / vertical / category, built
--    from day one; visibility controlled here, never by shipping code.
CREATE TABLE IF NOT EXISTS fams.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                     -- vertical.transportation, module.wallet, ride.vip
  kind TEXT NOT NULL CHECK (kind IN ('module','vertical','category','feature')),
  parent_code TEXT REFERENCES fams.services(code),
  name TEXT NOT NULL,
  icon TEXT,
  default_value TEXT NOT NULL DEFAULT 'on' CHECK (default_value IN ('on','off','hidden','maintenance','beta')),
  phase INT NOT NULL DEFAULT 1,                  -- launch phase 1..5
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) States (sub-country layer between geo.countries and geo.cities)
CREATE TABLE IF NOT EXISTS fams.states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                     -- NG-LAG, NG-ED (Edo), KE-NAI...
  country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fams_states_country ON fams.states(country_code);

-- 3) Feature flags — engine-native rules (richer than platform.feature_flags):
--    scope level/selector, time window, geofence, rollout %, user groups.
CREATE TABLE IF NOT EXISTS fams.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code TEXT NOT NULL REFERENCES fams.services(code),
  level TEXT NOT NULL DEFAULT 'global' CHECK (level IN ('global','country','state','city','category','vendor','asset')),
  selector TEXT,                                 -- NG, NG-ED, NG-BEN, ride.vip, vnd_.., ast_..
  value TEXT NOT NULL CHECK (value IN ('on','off','hidden','maintenance','beta')),
  user_groups TEXT[] NOT NULL DEFAULT '{}',      -- customers|vendors|corporate|beta|vip ({} = everyone)
  rollout_pct NUMERIC(5,2),                      -- deterministic % of user ids
  starts_at TIMESTAMPTZ,                         -- activate 01 Jan 2027 00:00
  ends_at TIMESTAMPTZ,                           -- deactivate 31 Jan 2027 23:59
  geofence JSONB,                                -- {"lat":6.5774,"lng":3.3212,"radiusM":15000}
  note TEXT,
  updated_by UUID REFERENCES identity.users(id),
  version BIGINT NOT NULL DEFAULT 1,             -- monotonic recency tie-break
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fams_flags_service ON fams.feature_flags(service_code);
CREATE INDEX IF NOT EXISTS idx_fams_flags_level_sel ON fams.feature_flags(level, selector);

-- 4) Service availability — location gates (country/state/city) for services
CREATE TABLE IF NOT EXISTS fams.service_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code TEXT NOT NULL REFERENCES fams.services(code),
  level TEXT NOT NULL CHECK (level IN ('global','country','state','city')),
  selector TEXT NOT NULL,                        -- NG | NG-ED | NG-BEN
  value TEXT NOT NULL CHECK (value IN ('on','off','hidden','maintenance','beta')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  note TEXT,
  updated_by UUID,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_code, level, selector)
);
CREATE INDEX IF NOT EXISTS idx_fams_avail_lookup ON fams.service_availability(service_code, selector);

-- 5) Phased rollouts & user-group activation (customers/vendors/corporate/beta/vip)
CREATE TABLE IF NOT EXISTS fams.feature_rollouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code TEXT NOT NULL REFERENCES fams.services(code),
  phase INT NOT NULL CHECK (phase BETWEEN 1 AND 5),
  user_groups TEXT[] NOT NULL DEFAULT '{customers}',
  rollout_pct NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  countries TEXT[] NOT NULL DEFAULT '{}',        -- {} = everywhere service is on
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Vendor activation — Active / Suspended / Pending Review / Maintenance
CREATE TABLE IF NOT EXISTS fams.vendor_activation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id),
  vendor_code TEXT UNIQUE NOT NULL,              -- vnd_a, vnd_b (engine key)
  state TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (state IN ('active','suspended','pending_review','maintenance')),
  reason TEXT,                                   -- audit-facing reason for last change
  countries TEXT[] NOT NULL DEFAULT '{}',        -- {} = follows service rules
  scheduled_resume_at TIMESTAMPTZ,               -- auto-clear maintenance window
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fams_vendor_state ON fams.vendor_activation(state);

-- 7) Asset activation — vehicle / motorcycle / helicopter / jet / boat, per
--    asset class or a single asset instance
CREATE TABLE IF NOT EXISTS fams.asset_activation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code TEXT UNIQUE NOT NULL,               -- ast_jet_b, or class 'helicopter'
  asset_type TEXT NOT NULL CHECK (asset_type IN ('vehicle','motorcycle','helicopter','jet','boat')),
  asset_id UUID,                                 -- optional instance ref (fleet table)
  service_code TEXT REFERENCES fams.services(code),
  value TEXT NOT NULL DEFAULT 'on' CHECK (value IN ('on','off','hidden','maintenance','beta')),
  countries TEXT[] NOT NULL DEFAULT '{}',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  note TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8) Scheduled activations — time-based control (cron applies due rows)
CREATE TABLE IF NOT EXISTS fams.scheduled_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL DEFAULT 'set_value' CHECK (action IN ('set_value','emergency_stop','emergency_clear')),
  service_code TEXT NOT NULL REFERENCES fams.services(code),
  level TEXT NOT NULL DEFAULT 'global' CHECK (level IN ('global','country','state','city','category','vendor','asset')),
  selector TEXT,
  value TEXT,                                    -- for set_value
  run_at TIMESTAMPTZ NOT NULL,                   -- e.g. 2027-01-01T00:00:00Z activate
  executed_at TIMESTAMPTZ,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fams_sched_due ON fams.scheduled_activations(executed_at, run_at);

-- 9) Emergency stops — kill switch (no deploy; overrides every rule)
CREATE TABLE IF NOT EXISTS fams.emergency_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_key TEXT UNIQUE NOT NULL,               -- 'vertical:aviation', 'module:wallet'
  reason TEXT NOT NULL,
  stopped_by UUID NOT NULL,
  stopped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at TIMESTAMPTZ
);

-- 10) FAMS audit log — every activation change is trail-logged (compliance)
CREATE TABLE IF NOT EXISTS fams.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,                          -- rule.upsert, rule.delete, emergency.on...
  target TEXT NOT NULL,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fams_audit_target ON fams.audit_log(target, created_at DESC);

-- Seed the service registry (18 platform modules + 8 verticals; categories
-- live in platform.service_categories since 001 and are referenced by code).
INSERT INTO fams.services (code, kind, parent_code, name, icon, default_value, phase, sort_order) VALUES
  ('module.transportation','module',NULL,'Rides & Taxi','🚗','on',1,10),
  ('module.logistics','module',NULL,'Logistics & Dispatch','📦','on',1,20),
  ('module.travel','module',NULL,'Flights (GDS)','✈️','on',2,30),
  ('module.aviation','module',NULL,'Private Aviation','🚁','on',2,40),
  ('module.security','module',NULL,'Security Services','🛡','on',2,50),
  ('module.accommodation','module',NULL,'Hotels & Short-lets','🏨','on',2,60),
  ('module.roadside','module',NULL,'Roadside Assistance','🛠','on',3,70),
  ('module.corporate','module',NULL,'Corporate Services','🏢','on',3,80),
  ('module.marine','module',NULL,'Marine / Boat Services','⚓','off',4,90),
  ('module.payments','module',NULL,'Payments','💳','on',1,100),
  ('module.wallet','module',NULL,'Wallet','👛','on',1,110),
  ('module.escrow','module',NULL,'Escrow','🔒','on',1,120),
  ('module.whatsapp_ai','module',NULL,'WhatsApp AI Assistant','🤖','on',1,130),
  ('module.ai_pricing','module',NULL,'AI Dynamic Pricing','📈','on',2,140),
  ('module.video_calls','module',NULL,'Video Calling','📹','on',2,150),
  ('module.loyalty','module',NULL,'Loyalty Programme','🏅','on',1,160),
  ('module.subscriptions','module',NULL,'Vendor Subscriptions','🗂','on',1,170),
  ('module.promotions','module',NULL,'Promotions & Offers','🎁','on',1,180),
  ('vertical.transportation','vertical','module.transportation','Rides','🚗','on',1,10),
  ('vertical.logistics','vertical','module.logistics','Deliveries','📦','on',1,20),
  ('vertical.travel','vertical','module.travel','Flights','✈️','on',2,30),
  ('vertical.aviation','vertical','module.aviation','Charters & Jets','🚁','on',2,40),
  ('vertical.security','vertical','module.security','Security','🛡','on',2,50),
  ('vertical.accommodation','vertical','module.accommodation','Hotels','🏨','on',2,60),
  ('vertical.roadside','vertical','module.roadside','Roadside','🛠','on',3,70),
  ('vertical.corporate_services','vertical','module.corporate','Corporate','🏢','on',3,80),
  ('vertical.marine','vertical','module.marine','Marine','⚓','off',4,90),
  ('ride.vip','category','vertical.transportation','VIP Taxi','👑','maintenance',1,45),
  ('ai.assistant_next_gen','feature','module.whatsapp_ai','Next-Gen AI Assistant','🧠','beta',3,25),
  ('promo.ride20','feature','module.promotions','20% Ride Promo','🎁','on',4,10),
  ('feature.ai_dynamic_pricing','feature','module.ai_pricing','AI Dynamic Pricing','📈','beta',2,10),
  ('feature.whatsapp_ai_assistant','feature','module.whatsapp_ai','WhatsApp AI Assistant','🤖','on',1,20),
  ('feature.video_calling','feature','module.video_calls','In-ride Video Calling','📹','beta',2,30),
  ('feature.wallet','feature','module.wallet','Wallet','👛','on',1,40),
  ('feature.escrow','feature','module.escrow','Escrow Protection','🔒','on',1,50)
ON CONFLICT (code) DO NOTHING;

-- Seed states (canonical codes: cities NG-LAG/NG-ABJ/NG-PHC/NG-BNI/NG-ASB/NG-ENU/
-- NG-AWK/NG-ONI/NG-KAN/NG-IBD map to these states)
INSERT INTO fams.states (code, country_code, name) VALUES
  ('NG-LA','NG','Lagos'),('NG-FCT','NG','FCT Abuja'),('NG-RI','NG','Rivers'),
  ('NG-ED','NG','Edo'),('NG-AN','NG','Anambra'),('NG-EN','NG','Enugu'),
  ('NG-KN','NG','Kano'),('NG-OY','NG','Oyo'),('NG-DE','NG','Delta'),
  ('KE-NAI','KE','Nairobi'),('GH-GA','GH','Greater Accra')
ON CONFLICT (code) DO NOTHING;

-- Seed availability rules mirroring backend/libs/fams/src/seed.ts (activePhase=4)
INSERT INTO fams.service_availability (service_code, level, selector, value, note) VALUES
  ('vertical.transportation','country','KE','off','Kenya launch pending'),
  ('vertical.logistics','country','KE','off','Kenya launch pending'),
  ('vertical.security','country','GH','off','Ghana security pending licensing'),
  ('vertical.aviation','state','NG-ED','off','No heliport / airspace clearance (Benin City)'),
  ('vertical.aviation','city','NG-ASB','off','Asaba airspace clearance pending'),
  ('module.marine','global','__global__','off','Phase 4 module — activated at launch'),
  ('vertical.marine','global','__global__','off','Phase 4 vertical — activated at launch')
ON CONFLICT (service_code, level, selector) DO NOTHING;

-- Seed feature flags: VIP ride maintenance + next-gen AI beta/vip-only
INSERT INTO fams.feature_flags (service_code, level, selector, value, note) VALUES
  ('ride.vip','category','ride.vip','maintenance','Fleet maintenance window'),
  ('ai.assistant_next_gen','global','__global__','beta','Next-gen assistant: beta + vip only')
ON CONFLICT DO NOTHING;

INSERT INTO fams.feature_rollouts (service_code, phase, user_groups, rollout_pct, countries, starts_at, ends_at) VALUES
  ('feature.whatsapp_ai_assistant', 1, '{customers}', 100, '{}', NULL, NULL),
  ('feature.escrow', 1, '{customers,vendors}', 100, '{}', NULL, NULL),
  ('feature.ai_dynamic_pricing', 2, '{beta,vip}', 25, '{NG}', NULL, NULL),
  ('promo.ride20', 4, '{customers}', 100, '{NG}', '2026-11-01T00:00:00Z', '2027-01-31T23:59:59Z')
ON CONFLICT DO NOTHING;

INSERT INTO fams.scheduled_activations (action, service_code, level, selector, value, run_at, note) VALUES
  ('set_value','vertical.travel','country','GH','on','2027-01-01T00:00:00Z','Ghana flights go-live'),
  ('emergency_clear','vertical.travel','global','__global__',NULL,'2027-01-31T23:59:59Z','Clear demo travel stop')
ON CONFLICT DO NOTHING;
