-- ============================================================================
-- MIGRATION 003 — Consolidated vision alignment (third master-prompt delta)
-- 1) luxury_vehicle_owner vendor type (16 vendor types)
-- 2) vacation_rentals + corporate_accommodation service categories
-- NOTE: run the ALTER TYPE statement alone (cannot combine with use of the
--       new value in the same transaction).
-- ============================================================================

-- 1) Vendor type
ALTER TYPE vendor_type ADD VALUE IF NOT EXISTS 'luxury_vehicle_owner';

-- 2) Service categories
INSERT INTO platform.service_categories (vertical,code,name,booking_mode,base_fare,price_model,sort_order) VALUES
 ('accommodation','vacation.rental','Vacation Rentals','instant',0,'{"nightly":true}',50),
 ('accommodation','corporate.accommodation','Corporate Accommodation','scheduled',0,'{"nightly":true,"corporate":true}',60)
ON CONFLICT (code) DO NOTHING;

-- 3) Marine consumer-surface flag (Phase 2 launch per roadmap)
INSERT INTO platform.feature_flags (key,description,enabled,scope) VALUES
 ('marine.vertical.enabled','Marine services (boat/yacht/water taxi) consumer surface',false,'{"countries":["NG"],"cities":["NG-LAG","NG-PHC"]}')
ON CONFLICT (key) DO NOTHING;
