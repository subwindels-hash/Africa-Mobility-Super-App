-- ============================================================================
-- MIGRATION 006 — Fifth master-prompt delta (full-platform re-acceptance)
-- 1) Tourism Services vertical (future-ready: built day one, FAMS-activated
--    later with NO code change — vertical sits OFF until admin switches it)
-- 2) User types 13 → 15: hotel_partner, boat_operator
-- 3) Tourism service categories + FAMS registry rows
-- NOTE: ALTER TYPE statements run alone (cannot combine with use of the new
--       value in the same transaction).
-- ============================================================================

-- 1) Service vertical
ALTER TYPE service_vertical ADD VALUE IF NOT EXISTS 'tourism';

-- 2) User types (spec lists 15 platform roles)
ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'hotel_partner';
ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'boat_operator';

-- 3) Tourism categories (catalog)
INSERT INTO platform.service_categories (vertical,code,name,booking_mode,base_fare,price_model,sort_order) VALUES
 ('tourism','tourism.package','Tour Packages','quote_based',0,'{"custom":true}',10),
 ('tourism','tourism.experiences','Experiences & Excursions','instant',0,'{"per_person":true}',20),
 ('tourism','tourism.guide','Tour Guide Services','scheduled',0,'{"per_day":true}',30),
 ('tourism','tourism.visa','Visa & Travel Documentation Assistance','quote_based',0,'{"per_application":true}',40)
ON CONFLICT (code) DO NOTHING;

-- 4) FAMS service registry: tourism vertical + module, OFF until launch
INSERT INTO fams.services (code, kind, parent_code, name, icon, default_value, phase, sort_order) VALUES
  ('module.tourism','module',NULL,'Tourism Services','🖼','off',5,95),
  ('vertical.tourism','vertical','module.tourism','Tourism','🖼','off',5,95),
  ('tourism.package','category','vertical.tourism','Tour Packages','🗺','off',5,540),
  ('tourism.experiences','category','vertical.tourism','Experiences & Excursions','🎟','off',5,550),
  ('tourism.guide','category','vertical.tourism','Tour Guide Services','🧭','off',5,560),
  ('tourism.visa','category','vertical.tourism','Visa & Documentation','🛂','off',5,570)
ON CONFLICT (code) DO NOTHING;

-- 5) FAMS availability rule mirroring the engine seed (OFF globally, ON in NG
--    whenever ops decides — one API call, zero deploys)
INSERT INTO fams.service_availability (service_code, level, selector, value, note) VALUES
  ('vertical.tourism','global','__global__','off','Built day one — activates via FAMS when tourism ops ready')
ON CONFLICT (service_code, level, selector) DO NOTHING;
