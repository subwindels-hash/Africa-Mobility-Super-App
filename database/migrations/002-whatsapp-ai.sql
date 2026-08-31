-- ============================================================================
-- MIGRATION 002 — WhatsApp Smart AI Customer Service Platform + new verticals
-- (roadside assistance, hotel & accommodation)
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block that
-- uses the new values afterwards. Run statements 1-3 alone, then the rest.
-- ============================================================================

-- 1) New verticals on the service catalog enum
ALTER TYPE service_vertical ADD VALUE IF NOT EXISTS 'roadside';
ALTER TYPE service_vertical ADD VALUE IF NOT EXISTS 'accommodation';

-- 2) WhatsApp enums
-- (Canonical enum set lives in schema.sql; created here for existing DBs:)
DO $$ BEGIN
  CREATE TYPE wa_message_type AS ENUM ('text','location','audio','image','document','button','interactive','template','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE wa_conv_status AS ENUM ('active','awaiting_customer','with_agent','closed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE wa_escalation_reason AS ENUM ('low_confidence','negative_sentiment','explicit_request','refund','safety','fraud');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE wa_escalation_status AS ENUM ('pending','with_agent','resolved_ai','resolved_agent','abandoned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE wa_broadcast_status AS ENUM ('draft','pending_approval','scheduled','sending','sent','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE wa_template_status AS ENUM ('draft','pending_meta','approved','rejected','paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE wa_link_status AS ENUM ('created','opened','paid','expired','used_failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE wa_direction AS ENUM ('inbound','outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Schema + tables (full definitions in schema.sql §whatsapp)
CREATE SCHEMA IF NOT EXISTS whatsapp;

CREATE TABLE IF NOT EXISTS whatsapp.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone VARCHAR(20) NOT NULL,
  user_id UUID REFERENCES identity.users(id),
  status wa_conv_status NOT NULL DEFAULT 'active',
  language TEXT NOT NULL DEFAULT 'en',
  current_intent TEXT,
  current_node TEXT,
  draft_slots JSONB NOT NULL DEFAULT '{}',
  context JSONB NOT NULL DEFAULT '{}',
  csat SMALLINT CHECK (csat BETWEEN 1 AND 5),
  last_message_at TIMESTAMPTZ,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_waconv_phone ON whatsapp.conversations(wa_phone);
CREATE INDEX IF NOT EXISTS idx_waconv_status ON whatsapp.conversations(status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp.messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES whatsapp.conversations(id) ON DELETE CASCADE,
  direction wa_direction NOT NULL,
  type wa_message_type NOT NULL,
  text TEXT,
  media_url TEXT,
  wa_message_id TEXT UNIQUE,
  intent TEXT,
  confidence NUMERIC(4,3),
  entities JSONB NOT NULL DEFAULT '{}',
  language TEXT,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wamsg_conv ON whatsapp.messages(conversation_id, id DESC);

CREATE TABLE IF NOT EXISTS whatsapp.escalations (
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

CREATE TABLE IF NOT EXISTS whatsapp.payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  conversation_id UUID REFERENCES whatsapp.conversations(id),
  booking_id UUID REFERENCES booking.bookings(id),
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  psp psp_provider NOT NULL DEFAULT 'paystack',
  signature TEXT NOT NULL,
  status wa_link_status NOT NULL DEFAULT 'created',
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_intent_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp.templates (
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

CREATE TABLE IF NOT EXISTS whatsapp.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES whatsapp.templates(id),
  name TEXT NOT NULL,
  audience JSONB NOT NULL DEFAULT '{}',
  status wa_broadcast_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  cost BIGINT NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL DEFAULT 'NGN',
  approved_by UUID REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp.broadcast_recipients (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES whatsapp.broadcasts(id) ON DELETE CASCADE,
  wa_phone VARCHAR(20) NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS whatsapp.analytics_daily (
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
  avg_first_response_s INT,
  csat_avg NUMERIC(3,2),
  gmv BIGINT NOT NULL DEFAULT 0,
  revenue BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country_code)
);

-- 4) Seed: new service categories (roadside + accommodation)
INSERT INTO platform.service_categories (vertical,code,name,booking_mode,base_fare,price_model,sort_order) VALUES
 ('roadside','roadside.recovery','Vehicle Recovery','quote_based',0,'{"custom":true}',10),
 ('roadside','roadside.towing','Towing Requests','quote_based',3500000,'{"per_km":30000,"base_km_included":10}',20),
 ('roadside','roadside.mechanical','Emergency Mechanical Support','quote_based',2500000,'{"per_hour":5000000}',30),
 ('roadside','roadside.fuel','Fuel Delivery Assistance','instant',1500000,'{"per_litre":90000,"call_out":1000000}',40),
 ('roadside','roadside.tyre','Tire Replacement Assistance','quote_based',2000000,'{"per_tyre":4500000}',50),
 ('roadside','roadside.battery','Battery Assistance','quote_based',2000000,'{"call_out":1500000}',60),
 ('accommodation','hotel.search','Hotel Search','search',0,'{"provider":"marketplace"}',10),
 ('accommodation','hotel.booking','Hotel Booking','instant',0,'{"nightly":true}',20),
 ('accommodation','apartment.booking','Apartment Booking','instant',0,'{"nightly":true}',30),
 ('accommodation','shortlet.reservation','Short-Let Reservations','instant',0,'{"nightly":true}',40)
ON CONFLICT (code) DO NOTHING;

-- 5) Seed: WhatsApp templates registered with Meta
INSERT INTO whatsapp.templates (name,category,locale,header,body,buttons,variables,meta_status) VALUES
 ('booking_confirmation','UTILITY','en','✅ Booking confirmed',
  'Your {{1}} from {{2}} to {{3}} is confirmed.\nDriver: {{4}}\nFare: {{5}} — protected in escrow.\nTrack: {{6}}',
  '[{"type":"URL","text":"Track live"},{"type":"URL","text":"Share trip"}]','{service,from,to,driver,fare,link}','approved'),
 ('driver_enroute','UTILITY','en',NULL,
  '{{1}} is on the way 🚗\nVehicle: {{2}}\nETA: {{3}} min\nCall (number masked): {{4}}',
  '[{"type":"PHONE_NUMBER","text":"Call driver"}]','{driver,vehicle,eta,masked}','approved'),
 ('arrival_notification','UTILITY','en',NULL,
  'Your driver has arrived at {{1}}. Pickup code: {{2}}','[]','{location,code}','approved'),
 ('payment_confirmation','UTILITY','en',NULL,
  'Payment of {{1}} received ✅ — held in escrow for booking {{2}}. Released to the vendor after completion.','[]','{amount,booking}','approved'),
 ('otp_verification','AUTHENTICATION','en',NULL,
  '{{1}} is your AMSA verification code. Never share it.','[]','{code}','approved'),
 ('order_update_logistics','UTILITY','en',NULL,
  '📦 Delivery {{1}}: {{2}}.\nNext stop: {{3}}. Recipient will show code {{4}} at handover.','[]','{ref,status,stop,code}','approved'),
 ('promo_broadcast','MARKETING','en',NULL,
  '🎉 {{1}} — {{2}}. Valid till {{3}}. Reply BOOK to use it.','[{"type":"QUICK_REPLY","text":"Book now"}]','{title,detail,expires}','pending_meta')
ON CONFLICT (name, locale) DO NOTHING;

-- 6) Feature flags
INSERT INTO platform.feature_flags (key,description,enabled,scope) VALUES
 ('whatsapp.ai.enabled','WhatsApp Smart AI assistant',true,'{"countries":["NG"]}'),
 ('whatsapp.payments.links','In-chat payment links',true,'{"countries":["NG"]}'),
 ('whatsapp.escalation.threshold','AI confidence below this escalates to human',true,'{"value":0.55}'),
 ('roadside.vertical.enabled','Roadside assistance marketplace',true,'{"countries":["NG"],"cities":["NG-LAG","NG-ABJ"]}')
ON CONFLICT (key) DO NOTHING;
