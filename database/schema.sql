-- ============================================================================
-- AFRICA MOBILITY SUPER APP (AMSA) — COMPLETE POSTGRESQL SCHEMA
-- PostgreSQL 16+ · encoding UTF8 · timezone UTC
-- Run order: this file is fully ordered and idempotent-safe on fresh DB.
-- Conventions: UUID PKs, timestamptz everywhere, money = BIGINT minor units
--              + currency CHAR(3) (ISO-4217), soft delete via deleted_at,
--              multi-tenancy via country_code/city_code/currency columns.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;        -- geometry for coverage/routes
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- CREATE EXTENSION IF NOT EXISTS timescaledb;  -- enable on telemetry host

-- ============================================================================
-- ENUM TYPES
-- ============================================================================
CREATE TYPE user_type AS ENUM ('customer','driver','dispatch_rider','vendor','fleet_owner','travel_agent','security_provider','jet_operator','helicopter_operator','corporate_client','support_agent','admin','super_admin');
CREATE TYPE kyc_level AS ENUM ('L1_PHONE','L2_IDENTITY','L3_ADDRESS','L4_BUSINESS');
CREATE TYPE verification_status AS ENUM ('unverified','pending','in_review','verified','rejected','expired','auto_suspended');
CREATE TYPE vendor_type AS ENUM ('taxi_operator','fleet_owner','luxury_vehicle_owner','chauffeur_company','dispatch_rider','logistics_company','courier_company','travel_agency','tour_operator','hotel','security_company','private_jet_operator','helicopter_operator','charter_company','boat_operator','corporate_service_provider');
CREATE TYPE vendor_status AS ENUM ('draft','pending_verification','in_review','active','suspended','deactivated','banned');
CREATE TYPE subscription_plan_tier AS ENUM ('free','standard','professional','enterprise');
CREATE TYPE asset_type AS ENUM ('car_economy','car_standard','car_premium','car_vip','car_luxury','car_executive','car_suv','motorcycle_dispatch','motorcycle_delivery','private_jet','helicopter','charter_aircraft','air_ambulance','boat','yacht','water_taxi');
CREATE TYPE asset_status AS ENUM ('pending_docs','active','in_trip','maintenance','suspended','retired');
CREATE TYPE booking_type AS ENUM ('instant','scheduled','corporate','recurring','quote_based');
CREATE TYPE service_vertical AS ENUM ('transportation','logistics','travel','aviation','marine','security','corporate_services','roadside','accommodation');
CREATE TYPE booking_status AS ENUM ('draft','priced','requested','matched','confirmed','en_route','in_progress','completed','settled','cancelled','expired','disputed','refunded');
CREATE TYPE booking_priority AS ENUM ('normal','priority','vip');
CREATE TYPE payment_method_type AS ENUM ('wallet','card','bank_transfer','ussd','cash','corporate_account');
CREATE TYPE payment_status AS ENUM ('initiated','pending','authorized','captured','failed','refunded','partially_refunded','chargeback_open','chargeback_lost','chargeback_won','cancelled');
CREATE TYPE psp_provider AS ENUM ('paystack','flutterwave','monnify','internal','gds','insurance_partner');
CREATE TYPE escrow_state AS ENUM ('authorized','funded','held','partially_released','released','dispute_hold','refunded','partially_refunded','expired');
CREATE TYPE payout_status AS ENUM ('queued','processing','paid','failed','reversed','on_hold');
CREATE TYPE dispute_status AS ENUM ('open','vendor_responded','under_review','awaiting_arbitration','resolved_customer','resolved_vendor','resolved_split','closed','escalated');
CREATE TYPE refund_status AS ENUM ('requested','approved','processing','paid','rejected','reversed');
CREATE TYPE wallet_type AS ENUM ('customer','vendor','driver','rider','corporate','platform_revenue','escrow','tax','float','marketing');
CREATE TYPE journal_status AS ENUM ('pending','posted','reversed','void');
CREATE TYPE thread_type AS ENUM ('booking','support','vendor','corporate','rfq');
CREATE TYPE message_kind AS ENUM ('text','image','voice_note','pdf','document','location','system');
CREATE TYPE call_type AS ENUM ('voice','video','masked_pstn');
CREATE TYPE call_status AS ENUM ('ringing','active','ended','missed','failed','fallback_sms');
CREATE TYPE loyalty_tier AS ENUM ('basic','silver','gold','platinum','executive');
CREATE TYPE incident_severity AS ENUM ('low','medium','high','critical');
CREATE TYPE incident_status AS ENUM ('open','triaging','responding','monitoring','resolved','closed','escalated_external');
CREATE TYPE approval_status AS ENUM ('pending','approved','rejected','expired','auto_approved','cancelled');
CREATE TYPE invoice_status AS ENUM ('draft','issued','partially_paid','paid','overdue','void');
CREATE TYPE fraud_risk AS ENUM ('low','medium','high','block');
CREATE TYPE promo_type AS ENUM ('percent','fixed_amount','free_delivery','cashback','referral');
CREATE TYPE review_target AS ENUM ('driver','rider','vendor','customer','asset');
CREATE TYPE notification_channel AS ENUM ('push','sms','whatsapp','email','in_app','voice_call');
CREATE TYPE personnel_status AS ENUM ('pending_verification','active','deployed','off_duty','suspended');
CREATE TYPE quote_status AS ENUM ('draft','sent','accepted','rejected','expired','withdrawn');
CREATE TYPE rfq_status AS ENUM ('open','quoting','awarded','expired','cancelled');
CREATE TYPE gds_provider AS ENUM ('amadeus','sabre');
CREATE TYPE flight_booking_status AS ENUM ('held','paid','ticketed','cancelled','refunded','failed');
CREATE TYPE trip_role AS ENUM ('driver','rider','both');
CREATE TYPE wa_direction AS ENUM ('inbound','outbound');
CREATE TYPE wa_message_type AS ENUM ('text','location','audio','image','document','button','interactive','template','system');
CREATE TYPE wa_conv_status AS ENUM ('active','awaiting_customer','with_agent','closed','expired');
CREATE TYPE wa_escalation_reason AS ENUM ('low_confidence','negative_sentiment','explicit_request','refund','safety','fraud');
CREATE TYPE wa_escalation_status AS ENUM ('pending','with_agent','resolved_ai','resolved_agent','abandoned');
CREATE TYPE wa_broadcast_status AS ENUM ('draft','pending_approval','scheduled','sending','sent','failed');
CREATE TYPE wa_template_status AS ENUM ('draft','pending_meta','approved','rejected','paused');
CREATE TYPE wa_link_status AS ENUM ('created','opened','paid','expired','used_failed');

-- ============================================================================
-- SCHEMA: geo — countries, cities, coverage, places
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS geo;

CREATE TABLE geo.countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code CHAR(2) UNIQUE NOT NULL,                 -- ISO-3166-1 alpha-2
  name TEXT NOT NULL,
  dial_code VARCHAR(8) NOT NULL,
  currency CHAR(3) NOT NULL,                    -- ISO-4217
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  languages TEXT[] NOT NULL DEFAULT '{en}',
  tax_model JSONB NOT NULL DEFAULT '{}',        -- VAT/WHT rules per country
  psp_config JSONB NOT NULL DEFAULT '{}',       -- enabled PSPs + priorities
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  phase INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE geo.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES geo.countries(id),
  code TEXT UNIQUE NOT NULL,                    -- e.g. 'NG-LAG'
  name TEXT NOT NULL,
  state TEXT,
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  center GEOMETRY(Point, 4326) NOT NULL,
  coverage GEOMETRY(Polygon, 4326),             -- default service polygon
  surge_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,     -- activated at launch
  launch_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cities_country ON geo.cities(country_id);
CREATE INDEX idx_cities_center ON geo.cities USING GIST(center);

CREATE TABLE geo.coverage_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id UUID NOT NULL REFERENCES geo.cities(id),
  service_vertical service_vertical NOT NULL,
  category_id UUID,                             -- FK platform.service_categories (added below)
  name TEXT NOT NULL,
  polygon GEOMETRY(Polygon, 4326) NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coverage_poly ON geo.coverage_zones USING GIST(polygon);

CREATE TABLE geo.places (                       -- saved/landmark places
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID,                           -- NULL = global landmark
  label TEXT NOT NULL,
  place_type TEXT NOT NULL DEFAULT 'other',     -- home, work, airport, hotel, landmark
  address TEXT,
  location GEOMETRY(Point, 4326) NOT NULL,
  google_place_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_places_owner ON geo.places(owner_user_id);
CREATE INDEX idx_places_loc ON geo.places USING GIST(location);

-- ============================================================================
-- SCHEMA: identity — users, sessions, devices, OTP, KYC, consent, audit
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,               -- usr_xxxxx
  phone VARCHAR(20) UNIQUE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email TEXT UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT,                           -- argon2id; NULL for OTP-only login
  full_name TEXT,
  avatar_url TEXT,
  primary_type user_type NOT NULL DEFAULT 'customer',
  country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
  city_id UUID REFERENCES geo.cities(id),
  locale TEXT NOT NULL DEFAULT 'en-NG',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  kyc_level kyc_level NOT NULL DEFAULT 'L1_PHONE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  banned_reason TEXT,
  loyalty_tier loyalty_tier NOT NULL DEFAULT 'basic',
  referral_code TEXT UNIQUE,
  referred_by_user_id UUID REFERENCES identity.users(id),
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT users_phone_or_email CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX idx_users_type ON identity.users(primary_type);
CREATE INDEX idx_users_city ON identity.users(city_id);

CREATE TABLE identity.user_roles (
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  role user_type NOT NULL,
  granted_by UUID REFERENCES identity.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE identity.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  device_id UUID,
  ip INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON identity.sessions(user_id);

CREATE TABLE identity.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,                    -- device hash
  platform TEXT NOT NULL,                       -- android | ios | web
  model TEXT,
  app_version TEXT,
  push_token TEXT,
  trusted BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);

CREATE TABLE identity.otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination TEXT NOT NULL,                    -- phone or email
  channel notification_channel NOT NULL DEFAULT 'sms',
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,                        -- login, kyc, payout, mfa, vendor_invite
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_destination ON identity.otp_codes(destination, purpose) WHERE consumed_at IS NULL;

CREATE TABLE identity.kyc_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                           -- identity_nin | identity_bvn | address | face | bank_penny_drop | cac | tin | license | insurance
  level kyc_level NOT NULL,
  provider TEXT,                                -- verification API partner
  provider_ref TEXT,
  status verification_status NOT NULL DEFAULT 'pending',
  submitted_data JSONB NOT NULL DEFAULT '{}',
  provider_result JSONB NOT NULL DEFAULT '{}',
  document_url TEXT,                            -- S3 key
  reviewed_by UUID REFERENCES identity.users(id),
  review_note TEXT,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kyc_user ON identity.kyc_verifications(user_id, kind);
CREATE INDEX idx_kyc_status ON identity.kyc_verifications(status) WHERE status IN ('pending','in_review');

CREATE TABLE identity.consents (                -- NDPR/GDPR consent ledger
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,                        -- terms, privacy, marketing, location, biometric
  granted BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_consents_user ON identity.consents(user_id, purpose);

CREATE TABLE identity.biometric_verifications ( -- face/liveness checks
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,                        -- daily_activation | booking | kyc
  selfie_url TEXT,
  match_score NUMERIC(5,4),
  passed BOOLEAN NOT NULL,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_biometrics_user ON identity.biometric_verifications(user_id, created_at DESC);

-- Tamper-evident audit log (hash chain per row)
CREATE TABLE identity.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID,
  actor_role user_type,
  action TEXT NOT NULL,                         -- e.g. escrow.release, admin.vendor.approve
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip INET,
  user_agent TEXT,
  trace_id TEXT,
  prev_hash TEXT,
  row_hash TEXT NOT NULL
);
CREATE INDEX idx_audit_entity ON identity.audit_logs(entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_actor ON identity.audit_logs(actor_user_id, occurred_at DESC);
CREATE INDEX idx_audit_action ON identity.audit_logs(action, occurred_at DESC);

-- ============================================================================
-- SCHEMA: platform — service catalog, CMS, flags, reviews, notifications
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE platform.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES platform.service_categories(id),
  vertical service_vertical NOT NULL,
  code TEXT UNIQUE NOT NULL,                    -- ride.economy, logistics.same_day, security.escort...
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  booking_mode TEXT NOT NULL DEFAULT 'instant', -- instant | scheduled | quote_based | search
  base_fare BIGINT,                             -- minor units, default currency of country config
  price_model JSONB NOT NULL DEFAULT '{}',      -- per_km, per_min, surge caps, wait rules
  cancellation_policy JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,                     -- e.g. vertical.aviation.enabled
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  scope JSONB NOT NULL DEFAULT '{}',            -- {"countries":["NG"],"cities":[],"percent":10}
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform.cms_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,                     -- home.hero.en, faq.security.pidgin
  locale TEXT NOT NULL DEFAULT 'en',
  content_type TEXT NOT NULL DEFAULT 'text',    -- text | markdown | image_url | json
  content TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                    -- booking.confirmed.customer
  channel notification_channel NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  template TEXT NOT NULL,                       -- body with {{vars}}
  variables TEXT[] NOT NULL DEFAULT '{}',
  is_critical BOOLEAN NOT NULL DEFAULT FALSE    -- critical => SMS fallback
);

CREATE TABLE platform.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  template_code TEXT,
  channel notification_channel NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued',        -- queued|sent|delivered|failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON platform.notifications(user_id, created_at DESC);

CREATE TABLE platform.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID,                              -- FK booking.bookings (added below)
  author_user_id UUID NOT NULL REFERENCES identity.users(id),
  target_type review_target NOT NULL,
  target_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags TEXT[] NOT NULL DEFAULT '{}',
  comment TEXT,
  tip_amount BIGINT DEFAULT 0,
  tip_currency CHAR(3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, author_user_id, target_type)
);
CREATE INDEX idx_reviews_target ON platform.reviews(target_type, target_id);

CREATE TABLE platform.fraud_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref TEXT UNIQUE NOT NULL,
  subject_type TEXT NOT NULL,                   -- user | vendor | booking | payment | device
  subject_id TEXT NOT NULL,
  risk fraud_risk NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}',          -- rule hits + model score + reasons
  model_score NUMERIC(5,4),
  status TEXT NOT NULL DEFAULT 'open',          -- open|reviewing|cleared|actioned|escalated
  assigned_to UUID REFERENCES identity.users(id),
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fraud_status ON platform.fraud_cases(status, created_at DESC);

-- ============================================================================
-- SCHEMA: vendor — vendors, verification, staff, subscriptions, assets
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS vendor;

CREATE TABLE vendor.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,               -- vnd_xxxx
  owner_user_id UUID NOT NULL REFERENCES identity.users(id),
  vendor_type vendor_type NOT NULL,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  cac_number TEXT,                              -- Corporate Affairs Commission
  tin TEXT,                                     -- Tax ID
  vat_registered BOOLEAN NOT NULL DEFAULT FALSE,
  country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
  city_id UUID NOT NULL REFERENCES geo.cities(id),
  address TEXT,
  contact_phone VARCHAR(20),
  contact_email TEXT,
  website TEXT,
  years_operating SMALLINT,
  staff_count INT,
  bank_code TEXT,                               -- Nigerian bank code
  bank_account_number TEXT,                     -- encrypted at rest via pgcrypto/KMS envelope
  bank_account_name TEXT,
  status vendor_status NOT NULL DEFAULT 'draft',
  verification_status verification_status NOT NULL DEFAULT 'unverified',
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  acceptance_rate NUMERIC(5,4),
  completion_rate NUMERIC(5,4),
  commission_override NUMERIC(5,4),             -- negotiated override of category take rate
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_vendors_type_city ON vendor.vendors(vendor_type, city_id, status);
CREATE INDEX idx_vendors_owner ON vendor.vendors(owner_user_id);

CREATE TABLE vendor.vendor_verifications (      -- 5-layer verification, per layer per vendor
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  layer TEXT NOT NULL,                          -- identity | business | license | insurance | compliance
  document_type TEXT NOT NULL,                  -- cac_cert, state_permit, ncaa_cert, insurance_policy, personnel_background...
  document_url TEXT NOT NULL,                   -- S3 key
  license_number TEXT,
  issued_at DATE,
  expires_at DATE,
  issuer TEXT,
  status verification_status NOT NULL DEFAULT 'pending',
  verified_value JSONB NOT NULL DEFAULT '{}',   -- e.g. insurance cover amount
  reviewed_by UUID REFERENCES identity.users(id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (vendor_id, layer, document_type)
);
CREATE INDEX idx_vendorverif_status ON vendor.vendor_verifications(status) WHERE status IN ('pending','in_review');
CREATE INDEX idx_vendorverif_expiry ON vendor.vendor_verifications(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE vendor.vendor_staff (              -- drivers/riders/agents/personnel linked to vendors
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  role TEXT NOT NULL,                           -- driver | rider | operations | manager | agent | security_personnel
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  commission_split NUMERIC(5,4),                -- vendor<->driver split when vendor supplies demand
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, user_id, role)
);
CREATE INDEX idx_vendorstaff_user ON vendor.vendor_staff(user_id);

CREATE TABLE platform.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier subscription_plan_tier UNIQUE NOT NULL,
  name TEXT NOT NULL,
  monthly_price BIGINT NOT NULL,                -- NGN minor units
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  max_listings INT,                             -- NULL = unlimited
  monthly_booking_cap INT,
  commission_discount_pts NUMERIC(4,2) NOT NULL DEFAULT 0,
  payout_sla TEXT NOT NULL DEFAULT 'T+1',
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE vendor.vendor_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES platform.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active',        -- active|past_due|cancelled|expired
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  price_paid BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  payment_intent_id UUID,                       -- FK money.payment_intents
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vsub_vendor ON vendor.vendor_subscriptions(vendor_id, status);

CREATE TABLE vendor.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,               -- ast_xxx
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  asset_type asset_type NOT NULL,
  make TEXT, model TEXT, year SMALLINT,
  color TEXT, plate_number TEXT,                -- vehicle reg / aircraft tail / boat reg
  capacity_pax SMALLINT,
  capacity_kg NUMERIC(8,2),
  amenities TEXT[] NOT NULL DEFAULT '{}',       -- wifi, leather, wheelchair, child_seat, medical_kit
  base_location GEOMETRY(Point, 4326),
  photos TEXT[] NOT NULL DEFAULT '{}',          -- S3 keys (ordered)
  video_url TEXT,
  status asset_status NOT NULL DEFAULT 'pending_docs',
  odometer_km INT,
  insurance_policy_ref TEXT,
  insurance_expiry DATE,
  last_maintenance_at DATE,
  next_maintenance_due DATE,
  metadata JSONB NOT NULL DEFAULT '{}',         -- e.g. {jet_range_nm, cabin_class, medical_equipment}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_assets_vendor ON vendor.assets(vendor_id, asset_type, status);
CREATE INDEX idx_assets_loc ON vendor.assets USING GIST(base_location);

CREATE TABLE vendor.asset_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES vendor.assets(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,                       -- road_worthiness, license, insurance, noise_cert, airworthiness...
  document_url TEXT NOT NULL,
  number TEXT,
  issued_at DATE,
  expires_at DATE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assetdocs_expiry ON vendor.asset_documents(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE vendor.asset_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES vendor.assets(id) ON DELETE CASCADE,
  performed_at DATE NOT NULL,
  kind TEXT NOT NULL,                           -- routine | repair | inspection | upgrade
  description TEXT NOT NULL,
  cost BIGINT, currency CHAR(3),
  odometer_km INT,
  vendor_service TEXT,
  documents TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vendor.asset_availability (        -- calendar blocks
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES vendor.assets(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL DEFAULT 'blocked',        -- blocked | available | maintenance | booked
  reason TEXT,
  booking_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT avail_window CHECK (ends_at > starts_at)
);
CREATE INDEX idx_avail_asset_time ON vendor.asset_availability(asset_id, starts_at);

CREATE TABLE vendor.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendor.vendors(id) ON DELETE CASCADE,   -- NULL = platform default
  category_id UUID REFERENCES platform.service_categories(id),
  asset_type asset_type,
  city_id UUID REFERENCES geo.cities(id),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  base_fare BIGINT NOT NULL,
  per_km BIGINT NOT NULL DEFAULT 0,
  per_minute BIGINT NOT NULL DEFAULT 0,
  per_kg BIGINT NOT NULL DEFAULT 0,
  per_stop BIGINT NOT NULL DEFAULT 0,
  wait_per_minute BIGINT NOT NULL DEFAULT 0,
  minimum_fare BIGINT NOT NULL,
  surge_cap NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  surge_participation BOOLEAN NOT NULL DEFAULT TRUE,
  schedule JSONB NOT NULL DEFAULT '{}',         -- night multipliers, peak windows
  priority INT NOT NULL DEFAULT 0,              -- most specific rule wins
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SCHEMA: booking — bookings, stops, events, RFQs, quotes, offers
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS booking;

CREATE TABLE booking.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,               -- bkg_xxx
  type booking_type NOT NULL,
  category_id UUID NOT NULL REFERENCES platform.service_categories(id),
  vertical service_vertical NOT NULL,
  status booking_status NOT NULL DEFAULT 'draft',
  customer_id UUID NOT NULL REFERENCES identity.users(id),
  vendor_id UUID REFERENCES vendor.vendors(id),
  assigned_staff_id UUID REFERENCES identity.users(id),  -- driver/rider
  asset_id UUID REFERENCES vendor.assets(id),
  company_id UUID,                              -- FK corporate.companies (added below)
  country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
  city_id UUID NOT NULL REFERENCES geo.cities(id),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  pickup_label TEXT,
  pickup_location GEOMETRY(Point, 4326) NOT NULL,
  dropoff_label TEXT,
  dropoff_location GEOMETRY(Point, 4326),
  route_polyline GEOMETRY(LineString, 4326),
  distance_m INT,
  duration_s INT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  cancelled_by TEXT,                            -- customer|vendor|driver|system|admin
  price_quote JSONB,                            -- frozen quote at confirmation (fare breakdown)
  final_price BIGINT,                           -- minor units
  commission_amount BIGINT,
  tax_amount BIGINT,
  vendor_net_amount BIGINT,
  payment_method payment_method_type NOT NULL DEFAULT 'wallet',
  payment_status payment_status NOT NULL DEFAULT 'initiated',
  promo_code TEXT,
  discount_amount BIGINT NOT NULL DEFAULT 0,
  corporate_cost_center TEXT,
  recurring_rule JSONB,                         -- parent template for recurring children
  parent_booking_id UUID REFERENCES booking.bookings(id),
  metadata JSONB NOT NULL DEFAULT '{}',         -- flight PNR link, parcel details, security scope...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_customer ON booking.bookings(customer_id, created_at DESC);
CREATE INDEX idx_bookings_vendor ON booking.bookings(vendor_id, status);
CREATE INDEX idx_bookings_staff ON booking.bookings(assigned_staff_id, status);
CREATE INDEX idx_bookings_ops ON booking.bookings(city_id, status, created_at DESC);
CREATE INDEX idx_bookings_active ON booking.bookings(status) WHERE status IN ('requested','matched','confirmed','en_route','in_progress','disputed');
CREATE INDEX idx_bookings_sched ON booking.bookings(scheduled_at) WHERE scheduled_at IS NOT NULL;

CREATE TABLE booking.booking_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
  seq SMALLINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'stop',            -- pickup | stop | dropoff
  label TEXT,
  location GEOMETRY(Point, 4326) NOT NULL,
  contact_name TEXT, contact_phone VARCHAR(20),
  otp_hash TEXT,                                -- release OTP for deliveries
  eta_s INT, actual_arrival TIMESTAMPTZ,
  pod_photo_url TEXT, pod_signature_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',       -- pending|arrived|completed|failed
  notes TEXT
);
CREATE UNIQUE INDEX idx_stops_seq ON booking.booking_stops(booking_id, seq);

CREATE TABLE booking.booking_events (           -- append-only state history
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
  status booking_status NOT NULL,
  actor_type TEXT, actor_id TEXT,
  reason TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bkevents_real ON booking.booking_events(booking_id, occurred_at);

CREATE TABLE booking.rfqs (                     -- quote-based requests (aviation, security, events, luxury)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  booking_id UUID REFERENCES booking.bookings(id),
  customer_id UUID NOT NULL REFERENCES identity.users(id),
  company_id UUID,                              -- FK corporate.companies
  vertical service_vertical NOT NULL,
  category_id UUID REFERENCES platform.service_categories(id),
  city_id UUID REFERENCES geo.cities(id),
  title TEXT NOT NULL,
  scope JSONB NOT NULL,                         -- pax, route, dates, personnel, risk, assets
  budget_min BIGINT, budget_max BIGINT, currency CHAR(3) NOT NULL DEFAULT 'NGN',
  desired_start TIMESTAMPTZ,
  desired_end TIMESTAMPTZ,
  status rfq_status NOT NULL DEFAULT 'open',
  invited_vendor_ids UUID[] NOT NULL DEFAULT '{}',
  closes_at TIMESTAMPTZ,
  awarded_quote_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rfq_status ON booking.rfqs(status, created_at DESC);

CREATE TABLE booking.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES booking.rfqs(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id),
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  milestone_plan JSONB NOT NULL DEFAULT '[]',   -- [{label,due_offset_hours,pct}]
  terms TEXT,
  valid_until TIMESTAMPTZ NOT NULL,
  status quote_status NOT NULL DEFAULT 'sent',
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_rfq ON booking.quotes(rfq_id, status);

CREATE TABLE booking.offers (                   -- instant dispatch offers to vendors/drivers
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendor.vendors(id),
  staff_user_id UUID REFERENCES identity.users(id),
  asset_id UUID REFERENCES vendor.assets(id),
  rank SMALLINT NOT NULL DEFAULT 1,
  match_score NUMERIC(6,4),
  fare BIGINT NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'sent',          -- sent|accepted|rejected|timeout|withdrawn
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_offers_booking ON booking.offers(booking_id, status);
CREATE INDEX idx_offers_staff ON booking.offers(staff_user_id, status) WHERE status = 'sent';

-- ============================================================================
-- SCHEMA: money — wallets, ledger, payments, escrow, payouts, disputes, FX
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS money;

CREATE TABLE money.fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base CHAR(3) NOT NULL,
  quote CHAR(3) NOT NULL,
  rate NUMERIC(16,8) NOT NULL,
  source TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fx_lookup ON money.fx_rates(base, quote, effective_at DESC);

CREATE TABLE money.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,               -- wal_xxx
  owner_user_id UUID REFERENCES identity.users(id),
  vendor_id UUID REFERENCES vendor.vendors(id),
  company_id UUID,                              -- FK corporate.companies
  wallet_type wallet_type NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
  balance_available BIGINT NOT NULL DEFAULT 0,  -- cached; truth = ledger
  balance_pending BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_owner CHECK (owner_user_id IS NOT NULL OR vendor_id IS NOT NULL OR company_id IS NOT NULL OR wallet_type IN ('platform_revenue','escrow','tax','float','marketing'))
);
CREATE UNIQUE INDEX idx_wallet_owner_unique ON money.wallets (COALESCE(owner_user_id,'00000000-0000-0000-0000-000000000000'), COALESCE(vendor_id,'00000000-0000-0000-0000-000000000000'), COALESCE(company_id,'00000000-0000-0000-0000-000000000000'), wallet_type, currency);
CREATE INDEX idx_wallets_user ON money.wallets(owner_user_id);

CREATE TABLE money.ledger_accounts (            -- chart of accounts (platform + per-wallet control accts)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                    -- 1001.CUSTOMER.usr_xxx style
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,                   -- asset|liability|revenue|expense|equity
  owner_user_id UUID, vendor_id UUID, company_id UUID,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE money.journal_entries (            -- append-only; reversal = new entry
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no BIGINT UNIQUE NOT NULL DEFAULT nextval('money.journal_seq'),
  booking_id UUID REFERENCES booking.bookings(id),
  source_type TEXT NOT NULL,                    -- payment|escrow|payout|refund|commission|subscription|reward|adjustment|chargeback
  source_id UUID,
  narration TEXT NOT NULL,
  status journal_status NOT NULL DEFAULT 'posted',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversal_of UUID REFERENCES money.journal_entries(id),
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE SEQUENCE IF NOT EXISTS money.journal_seq;

CREATE TABLE money.journal_lines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES money.journal_entries(id) ON DELETE CASCADE,
  ledger_account_id UUID NOT NULL REFERENCES money.ledger_accounts(id),
  wallet_id UUID REFERENCES money.wallets(id),
  direction CHAR(1) NOT NULL CHECK (direction IN ('D','C')),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN'
);
CREATE INDEX idx_jlines_entry ON money.journal_lines(journal_entry_id);
CREATE INDEX idx_jlines_wallet ON money.journal_lines(wallet_id, id DESC);

-- Balanced-entry guard trigger
CREATE OR REPLACE FUNCTION money.assert_balanced_entry() RETURNS trigger AS $$
DECLARE d BIGINT; c BIGINT; dc CHAR(3); cc CHAR(3);
BEGIN
  SELECT COALESCE(SUM(amount),0), MIN(currency) INTO d, dc FROM money.journal_lines WHERE journal_entry_id = NEW.journal_entry_id AND direction='D';
  SELECT COALESCE(SUM(amount),0), MIN(currency) INTO c, cc FROM money.journal_lines WHERE journal_entry_id = NEW.journal_entry_id AND direction='C';
  IF d IS DISTINCT FROM c OR dc IS DISTINCT FROM cc THEN
    RAISE EXCEPTION 'Unbalanced journal entry %: D=% (%), C=% (%)', NEW.journal_entry_id, d, dc, c, cc;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_journal_balanced
AFTER INSERT ON money.journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION money.assert_balanced_entry();

-- Wallet balance materialization
CREATE OR REPLACE FUNCTION money.apply_wallet_delta() RETURNS trigger AS $$
BEGIN
  UPDATE money.wallets w SET
    balance_available = balance_available + CASE WHEN t.direction='D' THEN t.amount ELSE -t.amount END,
    updated_at = now()
  FROM (SELECT * FROM (VALUES (NEW.wallet_id, NEW.direction, NEW.amount)) AS x(wid, dir, amt)) t(wid, dir, amt)
  WHERE w.id = NEW.wallet_id AND NEW.wallet_id IS NOT NULL;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TABLE money.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  method payment_method_type NOT NULL,
  psp psp_provider,
  psp_token TEXT,                               -- PSP tokenized ref only; never PAN
  brand TEXT, last4 TEXT, bank_code TEXT, bank_account_masked TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE money.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  wallet_id UUID REFERENCES money.wallets(id),
  booking_id UUID REFERENCES booking.bookings(id),
  purpose TEXT NOT NULL,                        -- booking|wallet_funding|subscription|payout_funding
  method payment_method_type NOT NULL,
  psp psp_provider,
  psp_ref TEXT,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  fx_rate_id UUID REFERENCES money.fx_rates(id),
  status payment_status NOT NULL DEFAULT 'initiated',
  failure_reason TEXT,
  authorized_at TIMESTAMPTZ, captured_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payint_user ON money.payment_intents(user_id, created_at DESC);
CREATE INDEX idx_payint_booking ON money.payment_intents(booking_id);
CREATE INDEX idx_payint_psp ON money.payment_intents(psp, psp_ref);
CREATE INDEX idx_payint_unreconciled ON money.payment_intents(created_at) WHERE reconciled_at IS NULL AND status IN ('captured','refunded','partially_refunded');

CREATE TABLE money.psp_webhooks (               -- raw events for replay & 3-way reconciliation
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psp psp_provider NOT NULL,
  event_type TEXT NOT NULL,
  psp_event_id TEXT UNIQUE,
  signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE money.escrow_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  booking_id UUID NOT NULL REFERENCES booking.bookings(id),
  quote_id UUID REFERENCES booking.quotes(id),
  wallet_id UUID REFERENCES money.wallets(id),
  total_amount BIGINT NOT NULL,
  released_amount BIGINT NOT NULL DEFAULT 0,
  refunded_amount BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  state escrow_state NOT NULL DEFAULT 'authorized',
  milestone_plan JSONB NOT NULL DEFAULT '[]',
  dispute_id UUID,
  hold_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_escrow_booking ON money.escrow_holds(booking_id);
CREATE INDEX idx_escrow_state ON money.escrow_holds(state);

CREATE TABLE money.escrow_releases (            -- one row per tranche (full or milestone)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID NOT NULL REFERENCES money.escrow_holds(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'completion',      -- completion|milestone|refund|partial_refund|reversal
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  commission BIGINT NOT NULL DEFAULT 0,
  tax BIGINT NOT NULL DEFAULT 0,
  vendor_net BIGINT NOT NULL DEFAULT 0,
  driver_share BIGINT,
  approved_by UUID REFERENCES identity.users(id),
  reason TEXT,
  journal_entry_id UUID REFERENCES money.journal_entries(id),
  released_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE money.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  beneficiary_type TEXT NOT NULL,               -- vendor|driver|rider|company|customer_refund
  vendor_id UUID REFERENCES vendor.vendors(id),
  user_id UUID REFERENCES identity.users(id),
  batch_id UUID,
  amount BIGINT NOT NULL CHECK (amount > 0),
  fee BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  destination TEXT NOT NULL,                    -- bank code+masked account
  psp psp_provider, psp_transfer_ref TEXT,
  status payout_status NOT NULL DEFAULT 'queued',
  scheduled_for TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  journal_entry_id UUID REFERENCES money.journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payouts_beneficiary ON money.payouts(beneficiary_type, vendor_id, user_id, status);
CREATE INDEX idx_payouts_queue ON money.payouts(status, scheduled_for);

CREATE TABLE money.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES money.payment_intents(id),
  booking_id UUID REFERENCES booking.bookings(id),
  dispute_id UUID,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  reason_code TEXT NOT NULL,
  initiator TEXT NOT NULL,                      -- customer|vendor|admin|system|chargeback
  status refund_status NOT NULL DEFAULT 'requested',
  psp_ref TEXT,
  journal_entry_id UUID REFERENCES money.journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE money.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  booking_id UUID NOT NULL REFERENCES booking.bookings(id),
  escrow_id UUID REFERENCES money.escrow_holds(id),
  opened_by UUID NOT NULL REFERENCES identity.users(id),
  category TEXT NOT NULL,                       -- service_quality|no_show|overcharge|safety|damage|fraud|other
  description TEXT NOT NULL,
  status dispute_status NOT NULL DEFAULT 'open',
  amount_claimed BIGINT NOT NULL,
  amount_awarded BIGINT,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  assigned_agent UUID REFERENCES identity.users(id),
  sla_respond_by TIMESTAMPTZ NOT NULL,
  sla_resolve_by TIMESTAMPTZ NOT NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_disputes_status ON money.disputes(status, sla_resolve_by);

CREATE TABLE money.dispute_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES money.disputes(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES identity.users(id),
  party TEXT NOT NULL,                          -- customer|vendor|agent|system
  message TEXT NOT NULL,
  attachments TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SCHEMA: travel — flight bookings, passengers, segments (Amadeus/Sabre)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS travel;

CREATE TABLE travel.flight_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  booking_id UUID NOT NULL REFERENCES booking.bookings(id),
  gds gds_provider NOT NULL,
  gds_pnr TEXT,
  airline_pnr TEXT,
  itinerary_type TEXT NOT NULL,                 -- one_way|return|multi_city
  origin TEXT NOT NULL, destination TEXT NOT NULL,
  depart_date DATE NOT NULL, return_date DATE,
  cabin TEXT NOT NULL DEFAULT 'economy',
  total_fare BIGINT NOT NULL,
  taxes BIGINT NOT NULL DEFAULT 0,
  service_fee BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status flight_booking_status NOT NULL DEFAULT 'held',
  ticket_numbers TEXT[] NOT NULL DEFAULT '{}',
  contact_email TEXT, contact_phone VARCHAR(20),
  gds_raw JSONB,
  hold_expires_at TIMESTAMPTZ,
  ticketed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_flightbk_booking ON travel.flight_bookings(booking_id);
CREATE INDEX idx_flightbk_pnr ON travel.flight_bookings(gds_pnr);

CREATE TABLE travel.flight_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_booking_id UUID NOT NULL REFERENCES travel.flight_bookings(id) ON DELETE CASCADE,
  seq SMALLINT NOT NULL,
  airline_code TEXT NOT NULL, flight_number TEXT NOT NULL,
  dep_airport TEXT NOT NULL, arr_airport TEXT NOT NULL,
  dep_at TIMESTAMPTZ NOT NULL, arr_at TIMESTAMPTZ NOT NULL,
  aircraft TEXT, duration_min INT,
  stops SMALLINT NOT NULL DEFAULT 0,
  cabin TEXT, baggage TEXT,
  seats TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE travel.flight_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_booking_id UUID NOT NULL REFERENCES travel.flight_bookings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'adult',           -- adult|child|infant
  gender TEXT,
  date_of_birth DATE,
  nationality CHAR(2),
  passport_number TEXT, passport_expiry DATE,
  ticket_number TEXT
);

-- ============================================================================
-- SCHEMA: secops — security personnel, deployments, incidents
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS secops;

CREATE TABLE secops.security_personnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id) ON DELETE CASCADE,
  user_id UUID REFERENCES identity.users(id),
  full_name TEXT NOT NULL,
  role_grade TEXT NOT NULL,                     -- agent|team_lead|supervisor| consultant
  license_number TEXT,
  license_expiry DATE,
  weapon_certified BOOLEAN NOT NULL DEFAULT FALSE,
  first_aid_certified BOOLEAN NOT NULL DEFAULT FALSE,
  background_check_ref TEXT,
  background_check_expiry DATE,
  status personnel_status NOT NULL DEFAULT 'pending_verification',
  photo_url TEXT,
  documents TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_personnel_vendor ON secops.security_personnel(vendor_id, status);
CREATE INDEX idx_personnel_expiry ON secops.security_personnel(license_expiry, background_check_expiry);

CREATE TABLE secops.deployments (               -- security engagement under a booking/RFQ
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES booking.bookings(id),
  vendor_id UUID NOT NULL REFERENCES vendor.vendors(id),
  run_sheet JSONB NOT NULL DEFAULT '{}',        -- routes, vehicles, protocols, comms plan
  personnel_ids UUID[] NOT NULL DEFAULT '{}',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',       -- planned|active|completed|aborted
  client_contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE secops.deployment_logs (           -- daily activity + milestone evidence
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES secops.deployments(id) ON DELETE CASCADE,
  logged_by UUID REFERENCES identity.users(id),
  log_date DATE NOT NULL,
  summary TEXT NOT NULL,
  incidents TEXT,
  client_signature_url TEXT,
  milestone_label TEXT,
  milestone_approved_by UUID,
  milestone_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE secops.incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES booking.bookings(id),
  deployment_id UUID REFERENCES secops.deployments(id),
  reporter_user_id UUID REFERENCES identity.users(id),
  severity incident_severity NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL,                       -- sos|accident|crime|medical|deviation|other
  status incident_status NOT NULL DEFAULT 'open',
  description TEXT,
  location GEOMETRY(Point, 4326),
  occurred_at TIMESTAMPTZ NOT NULL,
  timeline JSONB NOT NULL DEFAULT '[]',         -- auto-captured events trail
  response_actions JSONB NOT NULL DEFAULT '[]',
  resolved_at TIMESTAMPTZ,
  follow_up TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_status ON secops.incident_reports(status, severity, occurred_at DESC);

-- ============================================================================
-- SCHEMA: telemetry — GPS positions (Timescale), geofence events
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS telemetry;

CREATE TABLE telemetry.positions (
  booking_id UUID NOT NULL,
  user_id UUID NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  geom GEOMETRY(Point, 4326) NOT NULL,
  speed_kmh NUMERIC(5,2),
  heading SMALLINT,
  accuracy_m SMALLINT,
  source TEXT NOT NULL DEFAULT 'gps'            -- gps|network|osrm_snap
);
CREATE INDEX idx_positions_booking_time ON telemetry.positions(booking_id, ts DESC);
CREATE INDEX idx_positions_geom ON telemetry.positions USING GIST(geom);
-- SELECT create_hypertable('telemetry.positions','ts', chunk_time_interval => INTERVAL '1 day');
-- SELECT add_compression_policy('telemetry.positions', INTERVAL '7 days');

CREATE TABLE telemetry.geofence_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zone_id UUID NOT NULL REFERENCES geo.coverage_zones(id),
  subject_type TEXT NOT NULL,                  -- user|asset
  subject_id UUID NOT NULL,
  event TEXT NOT NULL,                          -- entered|exited|dwelled
  dwell_seconds INT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_geo_events_zone ON telemetry.geofence_events(zone_id, occurred_at DESC);

-- ============================================================================
-- SCHEMA: comms — threads, messages, calls
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS comms;

CREATE TABLE comms.threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  thread_type thread_type NOT NULL,
  booking_id UUID REFERENCES booking.bookings(id),
  rfq_id UUID REFERENCES booking.rfqs(id),
  title TEXT,
  created_by UUID REFERENCES identity.users(id),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX idx_threads_booking ON comms.threads(booking_id);
CREATE INDEX idx_threads_lastmsg ON comms.threads(last_message_at DESC);

CREATE TABLE comms.thread_participants (
  thread_id UUID NOT NULL REFERENCES comms.threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  role TEXT NOT NULL DEFAULT 'member',
  last_read_message_id BIGINT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE comms.messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES comms.threads(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES identity.users(id),
  kind message_kind NOT NULL DEFAULT 'text',
  body TEXT,                                    -- encrypted payload or transcript
  attachment_url TEXT,
  attachment_meta JSONB NOT NULL DEFAULT '{}',
  location GEOMETRY(Point, 4326),
  reply_to_id BIGINT,
  delivered_mask TEXT[] NOT NULL DEFAULT '{}',
  read_mask TEXT[] NOT NULL DEFAULT '{}',
  translation JSONB NOT NULL DEFAULT '{}',      -- {locale: text}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_messages_thread ON comms.messages(thread_id, id DESC);

CREATE TABLE comms.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES comms.threads(id),
  booking_id UUID REFERENCES booking.bookings(id),
  caller_id UUID NOT NULL REFERENCES identity.users(id),
  callee_id UUID NOT NULL REFERENCES identity.users(id),
  call_type call_type NOT NULL,
  status call_status NOT NULL DEFAULT 'ringing',
  masked_number VARCHAR(20),
  started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
  duration_s INT,
  recording_url TEXT,                           -- consented recordings only
  ai_summary TEXT,
  quality JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_parties ON comms.calls(caller_id, callee_id, created_at DESC);

-- ============================================================================
-- SCHEMA: corporate — companies, departments, employees, budgets, approvals, invoices
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS corporate;

CREATE TABLE corporate.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  cac_number TEXT,
  tin TEXT,
  industry TEXT,
  country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
  city_id UUID REFERENCES geo.cities(id),
  address TEXT,
  admin_user_id UUID NOT NULL REFERENCES identity.users(id),
  account_manager_id UUID REFERENCES identity.users(id),
  billing_email TEXT,
  billing_address TEXT,
  negotiated_commission NUMERIC(5,4),
  platform_fee_monthly BIGINT,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL DEFAULT 'pending_docs',  -- pending_docs|active|suspended
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE corporate.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES corporate.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES corporate.departments(id),
  cost_center_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE corporate.company_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES corporate.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  department_id UUID REFERENCES corporate.departments(id),
  title TEXT,
  role TEXT NOT NULL DEFAULT 'employee',        -- employee|approver|finance|admin
  approval_limit BIGINT NOT NULL DEFAULT 0,     -- minor units; 0 = none
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE TABLE corporate.budget_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES corporate.companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES corporate.departments(id),
  name TEXT NOT NULL,
  service_vertical service_vertical,
  period TEXT NOT NULL,                         -- 2026-09 monthly | Q3-2026 | FY2026
  limit_amount BIGINT NOT NULL,
  spent_amount BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  alert_threshold_pct SMALLINT NOT NULL DEFAULT 80,
  policy JSONB NOT NULL DEFAULT '{}',           -- class caps, allowlist vendors, curfew hours
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_budgets_company ON corporate.budget_pools(company_id, period);

CREATE TABLE corporate.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES corporate.companies(id),
  booking_id UUID REFERENCES booking.bookings(id),
  requested_by UUID NOT NULL REFERENCES identity.users(id),
  approver_id UUID REFERENCES identity.users(id),
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  reason TEXT,
  status approval_status NOT NULL DEFAULT 'pending',
  policy_reason TEXT,                           -- which rule triggered
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_approvals_pending ON corporate.approval_requests(status, approver_id) WHERE status='pending';

CREATE TABLE corporate.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  company_id UUID NOT NULL REFERENCES corporate.companies(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal BIGINT NOT NULL DEFAULT 0,
  vat BIGINT NOT NULL DEFAULT 0,
  wht BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status invoice_status NOT NULL DEFAULT 'draft',
  due_date DATE,
  pdf_url TEXT,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE corporate.invoice_lines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES corporate.invoices(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES booking.bookings(id),
  department_id UUID REFERENCES corporate.departments(id),
  employee_user_id UUID REFERENCES identity.users(id),
  description TEXT NOT NULL,
  service_vertical service_vertical,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN'
);
CREATE INDEX idx_invlines_invoice ON corporate.invoice_lines(invoice_id);

-- ============================================================================
-- SCHEMA: growth — loyalty, promotions, referrals
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS growth;

CREATE TABLE growth.loyalty_members (
  user_id UUID PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  tier loyalty_tier NOT NULL DEFAULT 'basic',
  points_balance BIGINT NOT NULL DEFAULT 0,
  lifetime_points BIGINT NOT NULL DEFAULT 0,
  rolling_90d_spend BIGINT NOT NULL DEFAULT 0,
  cashback_rate NUMERIC(4,3) NOT NULL DEFAULT 0.005,
  tier_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE growth.loyalty_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES booking.bookings(id),
  kind TEXT NOT NULL,                           -- earn|redeem|cashback|expire|adjust
  points BIGINT NOT NULL,
  value BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loyalty_ledger_user ON growth.loyalty_ledger(user_id, created_at DESC);

CREATE TABLE growth.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  type promo_type NOT NULL,
  value BIGINT NOT NULL,                        -- percent*100 or minor units
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  verticals service_vertical[] NOT NULL DEFAULT '{}',
  cities UUID[] NOT NULL DEFAULT '{}',
  max_redemptions INT,
  max_redemptions_per_user INT NOT NULL DEFAULT 1,
  min_spend BIGINT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  budget_cap BIGINT,
  budget_spent BIGINT NOT NULL DEFAULT 0,
  funded_by TEXT NOT NULL DEFAULT 'platform',   -- platform|vendor
  vendor_id UUID REFERENCES vendor.vendors(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_promo_active ON growth.promotions(is_active, ends_at);

CREATE TABLE growth.promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES growth.promotions(id),
  user_id UUID NOT NULL REFERENCES identity.users(id),
  booking_id UUID REFERENCES booking.bookings(id),
  discount_amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promotion_id, user_id, booking_id)
);

CREATE TABLE growth.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES identity.users(id),
  referee_id UUID NOT NULL REFERENCES identity.users(id),
  status TEXT NOT NULL DEFAULT 'pending',       -- pending|qualified|rewarded|rejected
  reward_type TEXT NOT NULL DEFAULT 'wallet_credit',
  reward_amount BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  qualified_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, referee_id)
);

-- ============================================================================
-- SCHEMA: analytics — rollup marts (incremental, replica-friendly)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE analytics.daily_city_metrics (
  day DATE NOT NULL,
  city_id UUID NOT NULL,
  vertical service_vertical NOT NULL,
  bookings INT NOT NULL DEFAULT 0,
  completed INT NOT NULL DEFAULT 0,
  cancelled INT NOT NULL DEFAULT 0,
  gmv BIGINT NOT NULL DEFAULT 0,
  commission BIGINT NOT NULL DEFAULT 0,
  net_revenue BIGINT NOT NULL DEFAULT 0,
  refunds BIGINT NOT NULL DEFAULT 0,
  new_customers INT NOT NULL DEFAULT 0,
  new_vendors INT NOT NULL DEFAULT 0,
  active_drivers INT NOT NULL DEFAULT 0,
  avg_match_seconds NUMERIC(10,2),
  PRIMARY KEY (day, city_id, vertical)
);

CREATE TABLE analytics.vendor_metrics_daily (
  day DATE NOT NULL,
  vendor_id UUID NOT NULL,
  offers_received INT DEFAULT 0,
  offers_accepted INT DEFAULT 0,
  bookings_completed INT DEFAULT 0,
  bookings_cancelled INT DEFAULT 0,
  gross_earnings BIGINT DEFAULT 0,
  commission_paid BIGINT DEFAULT 0,
  rating_avg NUMERIC(3,2),
  PRIMARY KEY (day, vendor_id)
);

CREATE TABLE analytics.driver_metrics_daily (
  day DATE NOT NULL,
  user_id UUID NOT NULL,
  trips INT DEFAULT 0,
  online_minutes INT DEFAULT 0,
  earnings BIGINT DEFAULT 0,
  acceptance_rate NUMERIC(5,4),
  PRIMARY KEY (day, user_id)
);

-- ============================================================================
-- SCHEMA: whatsapp — Smart AI Customer Service Platform (docs/26)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS whatsapp;

CREATE TABLE whatsapp.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone VARCHAR(20) NOT NULL,                 -- customer MSISDN
  user_id UUID REFERENCES identity.users(id),    -- linked platform identity (OTP match)
  status wa_conv_status NOT NULL DEFAULT 'active',
  language TEXT NOT NULL DEFAULT 'en',           -- en | ha | yo | ig | pcm
  current_intent TEXT,
  current_node TEXT,                             -- dialog node (collect_slots, confirm, payment…)
  draft_slots JSONB NOT NULL DEFAULT '{}',       -- live slot-filling state
  context JSONB NOT NULL DEFAULT '{}',           -- rolling context memory (last booking, prefs)
  csat SMALLINT CHECK (csat BETWEEN 1 AND 5),
  last_message_at TIMESTAMPTZ,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_waconv_phone ON whatsapp.conversations(wa_phone);        -- one live thread per customer
CREATE INDEX idx_waconv_status ON whatsapp.conversations(status, last_message_at DESC);

CREATE TABLE whatsapp.messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES whatsapp.conversations(id) ON DELETE CASCADE,
  direction wa_direction NOT NULL,
  type wa_message_type NOT NULL,
  text TEXT,
  media_url TEXT,                                -- S3 key for voice/images/docs
  wa_message_id TEXT UNIQUE,                     -- Cloud API message id (dedupe)
  intent TEXT,
  confidence NUMERIC(4,3),
  entities JSONB NOT NULL DEFAULT '{}',
  language TEXT,
  latency_ms INT,                                -- AI response time
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wamsg_conv ON whatsapp.messages(conversation_id, id DESC);
CREATE INDEX idx_wamsg_intent ON whatsapp.messages(intent, created_at DESC);

CREATE TABLE whatsapp.escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp.conversations(id) ON DELETE CASCADE,
  reason wa_escalation_reason NOT NULL,
  ai_confidence NUMERIC(4,3),
  assigned_agent_id UUID REFERENCES identity.users(id),
  status wa_escalation_status NOT NULL DEFAULT 'pending',
  first_response_seconds INT,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_waesc_pending ON whatsapp.escalations(status, created_at) WHERE status IN ('pending','with_agent');

CREATE TABLE whatsapp.payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,                -- wpl_xxx
  conversation_id UUID REFERENCES whatsapp.conversations(id),
  booking_id UUID REFERENCES booking.bookings(id),
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  psp psp_provider NOT NULL DEFAULT 'paystack',
  signature TEXT NOT NULL,                       -- HMAC (verified on redemption)
  status wa_link_status NOT NULL DEFAULT 'created',
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_intent_id UUID,                        -- FK money.payment_intents
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_walink_booking ON whatsapp.payment_links(booking_id);
CREATE INDEX idx_walink_open ON whatsapp.payment_links(expires_at) WHERE status IN ('created','opened');

CREATE TABLE whatsapp.templates (                -- Meta-approved WAMM templates
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('UTILITY','MARKETING','AUTHENTICATION')),
  locale TEXT NOT NULL DEFAULT 'en',
  header TEXT, body TEXT NOT NULL, footer TEXT,
  buttons JSONB NOT NULL DEFAULT '[]',
  variables TEXT[] NOT NULL DEFAULT '{}',
  meta_status wa_template_status NOT NULL DEFAULT 'draft',
  meta_rejected_reason TEXT,
  created_by UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, locale)
);

CREATE TABLE whatsapp.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES whatsapp.templates(id),
  name TEXT NOT NULL,
  audience JSONB NOT NULL DEFAULT '{}',          -- {cities, verticals, tiers, opt_in_only:true}
  status wa_broadcast_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  cost BIGINT NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL DEFAULT 'NGN',
  approved_by UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp.broadcast_recipients (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES whatsapp.broadcasts(id) ON DELETE CASCADE,
  wa_phone VARCHAR(20) NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',         -- queued|sent|delivered|read|failed
  error TEXT,
  sent_at TIMESTAMPTZ
);
CREATE INDEX idx_wabrec_broadcast ON whatsapp.broadcast_recipients(broadcast_id, status);

-- Daily rollups for the WhatsApp analytics dashboard
CREATE TABLE whatsapp.analytics_daily (
  day DATE NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'NG',
  conversations INT NOT NULL DEFAULT 0,
  active_conversations INT NOT NULL DEFAULT 0,
  messages_in INT NOT NULL DEFAULT 0,
  messages_out INT NOT NULL DEFAULT 0,
  bookings_created INT NOT NULL DEFAULT 0,
  bookings_completed INT NOT NULL DEFAULT 0,
  conversion_rate NUMERIC(5,4),
  ai_resolved INT NOT NULL DEFAULT 0,
  escalations INT NOT NULL DEFAULT 0,
  avg_ai_response_ms INT,
  avg_first_response_s INT,                      -- human agent first-response
  csat_avg NUMERIC(3,2),
  gmv BIGINT NOT NULL DEFAULT 0,
  revenue BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country_code)
);

-- Marketing/consent: WhatsApp outreach requires explicit opt-in (NDPR + Meta policy)
ALTER TABLE identity.consents
  ADD CONSTRAINT consent_purpose_wa CHECK (purpose <> 'whatsapp_marketing' OR granted = true) NOT VALID;

-- ============================================================================
-- HELPFUL VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW booking.v_active_bookings AS
  SELECT * FROM booking.bookings WHERE status IN ('requested','matched','confirmed','en_route','in_progress');

CREATE OR REPLACE VIEW money.v_wallet_truth AS
SELECT w.id wallet_id, w.balance_available cached_balance,
       COALESCE(SUM(CASE WHEN l.direction='D' THEN l.amount ELSE -l.amount END),0) ledger_balance
FROM money.wallets w
LEFT JOIN money.journal_lines l ON l.wallet_id = w.id
GROUP BY w.id, w.balance_available;

CREATE OR REPLACE VIEW vendor.v_expiring_docs AS
SELECT 'vendor' AS scope, vendor_id, layer AS item, expires_at
FROM vendor.vendor_verifications WHERE expires_at < now() + INTERVAL '30 days'
UNION ALL
SELECT 'asset', asset_id, doc_type, expires_at
FROM vendor.asset_documents WHERE expires_at < now() + INTERVAL '30 days'
UNION ALL
SELECT 'personnel', id, 'license', license_expiry
FROM secops.security_personnel WHERE license_expiry < now() + INTERVAL '30 days';

CREATE OR REPLACE VIEW whatsapp.v_agent_inbox AS
SELECT e.id, e.conversation_id, c.wa_phone, c.language, e.reason, e.status, e.ai_confidence,
       c.last_message_at, u.full_name AS agent
FROM whatsapp.escalations e
JOIN whatsapp.conversations c ON c.id = e.conversation_id
LEFT JOIN identity.users u ON u.id = e.assigned_agent_id
WHERE e.status IN ('pending','with_agent')
ORDER BY e.created_at;

CREATE OR REPLACE VIEW whatsapp.v_conversation_performance AS
SELECT c.id, c.wa_phone, c.status, c.language,
       COUNT(m.id) FILTER (WHERE m.direction = 'inbound') AS msgs_in,
       COUNT(m.id) FILTER (WHERE m.direction = 'outbound') AS msgs_out,
       MAX(m.confidence) AS top_confidence,
       MAX(m.created_at) AS last_at,
       (SELECT COUNT(*) FROM booking.bookings b WHERE b.customer_id = c.user_id AND b.created_at > c.session_started_at) AS bookings_this_session
FROM whatsapp.conversations c
LEFT JOIN whatsapp.messages m ON m.conversation_id = c.id
GROUP BY c.id;

-- ============================================================================
-- ROW-LEVEL SECURITY EXAMPLE (multi-tenant isolation for future split)
-- ============================================================================
ALTER TABLE booking.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_city_isolation ON booking.bookings
  USING (true);  -- tightened per-service roles at physical-split stage
