-- ============================================================================
-- MIGRATION 010 — INTERSTATE LOGISTICS & LONG-DISTANCE FREIGHT (docs/32)
-- Nationwide freight marketplace: platform owns no trucks; verified third-
-- party logistics partners only. FAMS-gated end to end (ilst.* features,
-- cargo/vehicle/route categories, states, vendors).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS interstate;

-- 1) Freight vehicle catalog (14 categories; platform-wide reference data)
CREATE TABLE IF NOT EXISTS interstate.vehicle_categories (
  category TEXT PRIMARY KEY,                        -- heavy_truck, refrigerated_truck…
  label TEXT NOT NULL,
  capacity_kg INT NOT NULL CHECK (capacity_kg > 0),
  length_m NUMERIC(4,1) NOT NULL, width_m NUMERIC(4,1) NOT NULL, height_m NUMERIC(4,1) NOT NULL,
  cargo_support TEXT[] NOT NULL DEFAULT '{}',
  refrigerated BOOLEAN NOT NULL DEFAULT FALSE,
  rate_index NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  min_road_class TEXT NOT NULL DEFAULT 'street' CHECK (min_road_class IN ('street','secondary','primary','highway','truck_route'))
);

-- 2) Vendor fleet units — capacity/dimensions/insurance/maintenance/availability/regions
CREATE TABLE IF NOT EXISTS interstate.freight_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id),
  category TEXT NOT NULL REFERENCES interstate.vehicle_categories(category),
  plate TEXT UNIQUE NOT NULL,
  capacity_kg INT NOT NULL,
  dimensions_m JSONB NOT NULL,                     -- {l,w,h}
  max_weight_kg INT NOT NULL,
  cargo_support TEXT[] NOT NULL DEFAULT '{}',
  insurance_policy TEXT,
  insurance_expiry DATE,
  maintenance_records JSONB NOT NULL DEFAULT '[]', -- [{at, type, odometerKm, notes}]
  next_maintenance_km INT,
  availability_calendar DATERANGE,                 -- booked/free windows
  operating_regions TEXT[] NOT NULL DEFAULT '{}',  -- state codes
  telematics_vehicle UUID REFERENCES mobility.vehicles(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','on_haul','maintenance','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ilst_vehicles_vendor ON interstate.freight_vehicles(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_ilst_vehicles_avail ON interstate.freight_vehicles USING GIST(availability_calendar);

-- 3) Vendor verification chain (7 steps; compliance_approval is the final gate)
CREATE TABLE IF NOT EXISTS interstate.vendor_verifications (
  vendor_id UUID PRIMARY KEY REFERENCES vendor.vendors(id),
  vendor_type TEXT NOT NULL CHECK (vendor_type IN ('trucking_company','fleet_operator','independent_truck_owner','freight_broker','warehouse_operator','cold_chain_operator','distribution_company')),
  business_verification TEXT NOT NULL DEFAULT 'pending' CHECK (business_verification IN ('pending','approved','rejected')),
  identity_verification TEXT NOT NULL DEFAULT 'pending' CHECK (identity_verification IN ('pending','approved','rejected')),
  tax_verification TEXT NOT NULL DEFAULT 'pending' CHECK (tax_verification IN ('pending','approved','rejected')),
  insurance_verification TEXT NOT NULL DEFAULT 'pending' CHECK (insurance_verification IN ('pending','approved','rejected')),
  vehicle_verification TEXT NOT NULL DEFAULT 'pending' CHECK (vehicle_verification IN ('pending','approved','rejected')),
  driver_verification TEXT NOT NULL DEFAULT 'pending' CHECK (driver_verification IN ('pending','approved','rejected')),
  compliance_approval TEXT NOT NULL DEFAULT 'pending' CHECK (compliance_approval IN ('pending','approved','rejected')),
  decided_by TEXT, decided_at TIMESTAMPTZ,
  active BOOLEAN GENERATED ALWAYS AS (
    business_verification = 'approved' AND identity_verification = 'approved'
    AND tax_verification = 'approved' AND insurance_verification = 'approved'
    AND vehicle_verification = 'approved' AND driver_verification = 'approved'
    AND compliance_approval = 'approved') STORED
);

-- 4) Shipments (cargo, stops, status, vehicle/driver, ETA, delivery confirmation)
CREATE TABLE IF NOT EXISTS interstate.shipments (
  id TEXT PRIMARY KEY,                              -- shp_1
  service TEXT NOT NULL CHECK (service IN ('ftl','ltl','shared_cargo','bulk_cargo','container','cold_chain','heavy_equipment','construction_material','agricultural_produce','fmcg','manufacturing','warehouse_to_warehouse','b2b','b2c','government','ngo_humanitarian','medical_pharma','ecommerce_line_haul','livestock','vehicle_transport','machinery')),
  customer_id UUID NOT NULL REFERENCES identity.users(id),
  corporate_account_id UUID,                        -- corporate logistics
  vendor_id UUID REFERENCES vendor.vendors(id),
  driver_id UUID REFERENCES identity.users(id),
  freight_vehicle_id UUID REFERENCES interstate.freight_vehicles(id),
  cargo_type TEXT NOT NULL,                         -- construction/cold_chain/…
  cargo_value_minor BIGINT NOT NULL DEFAULT 0,
  weight_kg INT NOT NULL CHECK (weight_kg > 0),
  dimensions_m JSONB NOT NULL,
  booking_option TEXT NOT NULL CHECK (booking_option IN ('instant','scheduled','quote_request','compare_providers','one_way','return_trip','recurring','dedicated_fleet')),
  scheduled_for TIMESTAMPTZ,
  recurrence TEXT CHECK (recurrence IN ('weekly','monthly')),
  status TEXT NOT NULL DEFAULT 'quote_requested' CHECK (status IN ('quote_requested','quote_accepted','awaiting_pickup','driver_assigned','cargo_loaded','in_transit','checkpoint_update','delivered','completed','cancelled','disputed')),
  quote_minor BIGINT,
  payment_mode TEXT CHECK (payment_mode IN ('instant','escrow','corporate_billing','partial','milestone')),
  escrow_id UUID REFERENCES money.escrow_holds(id),
  settled_minor BIGINT,
  eta_at TIMESTAMPTZ,
  current_lat DOUBLE PRECISION, current_lng DOUBLE PRECISION,
  rating_score INT CHECK (rating_score BETWEEN 1 AND 5),
  rating_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ilst_shipments_customer ON interstate.shipments(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ilst_shipments_vendor ON interstate.shipments(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_ilst_shipments_status ON interstate.shipments(status) WHERE status NOT IN ('completed','cancelled');

-- 5) Stops — single/multi pickup + single/multi destination
CREATE TABLE IF NOT EXISTS interstate.shipment_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id TEXT NOT NULL REFERENCES interstate.shipments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pickup','dropoff')),
  sequence INT NOT NULL,
  label TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  state_code TEXT NOT NULL REFERENCES geo.states(code),
  completed_at TIMESTAMPTZ,
  UNIQUE (shipment_id, kind, sequence)
);

-- 6) Quote comparisons (multi-provider offers per request)
CREATE TABLE IF NOT EXISTS interstate.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id TEXT REFERENCES interstate.shipments(id),
  service TEXT NOT NULL,
  origin_state TEXT NOT NULL REFERENCES geo.states(code),
  destination_state TEXT NOT NULL REFERENCES geo.states(code),
  distance_km INT NOT NULL,
  offers JSONB NOT NULL DEFAULT '[]',               -- [{vendorId, priceMinor, etaHours, rating…}]
  recommended_vendor UUID REFERENCES vendor.vendors(id),
  best_vehicle_category TEXT REFERENCES interstate.vehicle_categories(category),
  estimate_minor BIGINT NOT NULL,
  estimate_eta_hours NUMERIC(5,1) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7) Tracking events — GPS/checkpoints/ETA/geofence (route playback source)
CREATE TABLE IF NOT EXISTS interstate.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id TEXT NOT NULL REFERENCES interstate.shipments(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
  label TEXT, note TEXT,
  eta_at TIMESTAMPTZ,
  outside_geofence BOOLEAN NOT NULL DEFAULT FALSE,
  created_via TEXT NOT NULL DEFAULT 'telemetry' CHECK (created_via IN ('telemetry','checkpoint','whatsapp','driver_app'))
);
CREATE INDEX IF NOT EXISTS idx_ilst_tracking_playback ON interstate.tracking_events(shipment_id, ts);

-- 8) Shareable tracking links (authorized recipients, TTL)
CREATE TABLE IF NOT EXISTS interstate.tracking_links (
  token TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES interstate.shipments(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  granted_by UUID REFERENCES identity.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9) Cargo security — seals, tamper/geofence alerts, proofs & signatures
CREATE TABLE IF NOT EXISTS interstate.cargo_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id TEXT NOT NULL REFERENCES interstate.shipments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('seal_install','tamper_alert','geofence_alert','driver_identity_check','cargo_verification','proof_of_pickup','proof_of_delivery','photo_confirmation')),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seal_id TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}',
  digital_signature TEXT,
  signed_by TEXT,
  detail TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_ilst_inspections_shipment ON interstate.cargo_inspections(shipment_id, at DESC);

-- 10) Shipment insurance policies
CREATE TABLE IF NOT EXISTS interstate.shipment_insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id TEXT NOT NULL REFERENCES interstate.shipments(id) ON DELETE CASCADE,
  policy_no TEXT NOT NULL,
  insured_minor BIGINT NOT NULL,
  premium_minor BIGINT NOT NULL,
  underwriter TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11) Corporate logistics — accounts, departments, approvals, budgets
CREATE TABLE IF NOT EXISTS interstate.corporate_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                        -- corp_dangote
  name TEXT NOT NULL,
  billing_type TEXT NOT NULL DEFAULT 'monthly_invoice' CHECK (billing_type IN ('monthly_invoice','prepaid','wallet')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS interstate.corporate_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES interstate.corporate_accounts(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL,
  budget_minor BIGINT NOT NULL DEFAULT 0,
  spent_minor BIGINT NOT NULL DEFAULT 0,
  UNIQUE (account_id, code)
);
CREATE TABLE IF NOT EXISTS interstate.corporate_approvers (
  department_id UUID NOT NULL REFERENCES interstate.corporate_departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  PRIMARY KEY (department_id, user_id)
);
CREATE TABLE IF NOT EXISTS interstate.transport_requests (
  id TEXT PRIMARY KEY,                              -- req_1
  account_id UUID NOT NULL REFERENCES interstate.corporate_accounts(id),
  department_id UUID NOT NULL REFERENCES interstate.corporate_departments(id),
  requested_by UUID NOT NULL REFERENCES identity.users(id),
  service TEXT NOT NULL,
  origin_state TEXT NOT NULL REFERENCES geo.states(code),
  dest_state TEXT NOT NULL REFERENCES geo.states(code),
  estimated_minor BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','booked')),
  decided_by UUID REFERENCES identity.users(id),
  shipment_id TEXT REFERENCES interstate.shipments(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS interstate.corporate_invoices (
  id TEXT PRIMARY KEY,                              -- inv_corp_x_2026-08
  account_id UUID NOT NULL REFERENCES interstate.corporate_accounts(id),
  period CHAR(7) NOT NULL,                          -- 2026-08
  lines JSONB NOT NULL DEFAULT '[]',
  total_minor BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','paid','overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12) Corridors & FAMS-gated route control (future: cross-border legs)
CREATE TABLE IF NOT EXISTS interstate.corridors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                        -- route.NG-LAG-NG-KAN (FAMS category target)
  origin_state TEXT NOT NULL REFERENCES geo.states(code),
  destination_state TEXT NOT NULL REFERENCES geo.states(code),
  distance_km INT NOT NULL,
  avg_transit_hours NUMERIC(5,1),
  toll_ngn INT NOT NULL DEFAULT 0,
  security_risk NUMERIC(3,2) NOT NULL DEFAULT 0.2 CHECK (security_risk BETWEEN 0 AND 1),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  cross_border BOOLEAN NOT NULL DEFAULT FALSE,      -- future phase
  partner_country CHAR(2)                           -- future: GH/KE/ZA…
);

-- Seed: FAMS service entries + activation rules (no source changes to toggle)
INSERT INTO fams.services (code, kind, parent_code, name, icon, default_value, phase, sort_order) VALUES
  ('feature.ilst.marketplace','feature',NULL,'Interstate Logistics Marketplace','🚚','on',1,70),
  ('feature.ilst.cold_chain','feature',NULL,'Cold Chain Logistics','🧊','on',1,72),
  ('feature.ilst.corporate','feature',NULL,'Corporate Logistics','🏢','on',1,74),
  ('feature.ilst.permitted_cargo','feature',NULL,'Permitted Cargo (Livestock/Heavy Haul)','🐃','off',4,76),
  ('feature.ilst.cross_border','feature',NULL,'Cross-Border African Logistics','🌍','off',6,78)
ON CONFLICT (code) DO NOTHING;

INSERT INTO fams.feature_flags (service_code, level, selector, value, note) VALUES
  ('feature.ilst.marketplace','global',NULL,'on','Nationwide interstate logistics marketplace — launch'),
  ('feature.ilst.cold_chain','global',NULL,'on','Refrigerated logistics live'),
  ('feature.ilst.corporate','global',NULL,'on','Corporate logistics accounts live'),
  ('feature.ilst.permitted_cargo','global',NULL,'off','Livestock/heavy-haul — only where legally permitted'),
  ('feature.ilst.permitted_cargo','state','NG-KAN','on','Livestock transport permitted & certified in Kano'),
  ('feature.ilst.permitted_cargo','state','NG-KAD','on','Livestock transport permitted & certified in Kaduna'),
  ('feature.ilst.cross_border','global',NULL,'off','Cross-Border African Logistics — future phase')
ON CONFLICT DO NOTHING;

-- Seed: freight vehicle catalog (14 categories)
INSERT INTO interstate.vehicle_categories (category, label, capacity_kg, length_m, width_m, height_m, cargo_support, refrigerated, rate_index, min_road_class) VALUES
  ('mini_van','Mini Van',600,1.8,1.3,1.2,ARRAY['general','fmcg','pharma'],FALSE,1.0,'street'),
  ('cargo_van','Cargo Van',1200,3.0,1.6,1.7,ARRAY['general','fmcg','ecommerce','pharma'],FALSE,1.25,'street'),
  ('pickup_truck','Pickup Truck',1500,2.4,1.5,0.6,ARRAY['general','construction','agricultural'],FALSE,1.35,'street'),
  ('light_truck','Light Truck',3500,4.2,2.0,1.9,ARRAY['general','fmcg','agricultural','palletized'],FALSE,1.8,'secondary'),
  ('medium_truck','Medium Truck',8000,5.5,2.2,2.2,ARRAY['general','fmcg','agricultural','construction','palletized','industrial'],FALSE,2.4,'primary'),
  ('heavy_truck','Heavy Truck',18000,7.0,2.4,2.5,ARRAY['general','bulk','construction','industrial','palletized'],FALSE,3.2,'truck_route'),
  ('flatbed_truck','Flatbed Truck',15000,6.5,2.4,0,ARRAY['heavy','machinery','construction','vehicles','steel'],FALSE,3.0,'truck_route'),
  ('box_truck','Box Truck',10000,6.0,2.3,2.4,ARRAY['general','fmcg','palletized','ecommerce','household'],FALSE,2.6,'primary'),
  ('refrigerated_truck','Refrigerated Truck',9000,5.8,2.2,2.2,ARRAY['cold_chain','pharma','agricultural','fmcg'],TRUE,3.4,'primary'),
  ('tanker','Tanker',33000,9.0,2.5,2.8,ARRAY['liquid_bulk','fuel','chemicals'],FALSE,4.2,'truck_route'),
  ('low_loader','Low Loader',40000,12.0,2.9,0.9,ARRAY['heavy','machinery','vehicles','construction'],FALSE,4.6,'truck_route'),
  ('container_truck','Container Truck',30000,12.2,2.5,2.9,ARRAY['container','general','palletized'],FALSE,4.0,'truck_route'),
  ('articulated_trailer','Articulated Trailer',34000,13.6,2.5,2.7,ARRAY['general','bulk','container','palletized','industrial'],FALSE,4.4,'truck_route'),
  ('specialized_heavy_haul','Specialized Heavy Haul Equipment',80000,16.0,3.5,1.0,ARRAY['heavy','machinery','power_transformers','wind_blades'],FALSE,6.5,'truck_route')
ON CONFLICT (category) DO NOTHING;

-- Seed: flagship corridors (FAMS route categories — admin toggleable, no code)
INSERT INTO interstate.corridors (code, origin_state, destination_state, distance_km, avg_transit_hours, toll_ngn, security_risk) VALUES
  ('route.NG-LAG-NG-KAN','NG-LAG','NG-KAN',570,11.5,4500,0.20),
  ('route.NG-LAG-NG-FCT','NG-LAG','NG-FCT',720,13.0,5500,0.18),
  ('route.NG-LAG-NG-RIV','NG-LAG','NG-RIV',600,10.5,3000,0.25),
  ('route.NG-KAN-NG-BOR','NG-KAN','NG-BOR',520,9.0,0,0.55)
ON CONFLICT (code) DO NOTHING;
