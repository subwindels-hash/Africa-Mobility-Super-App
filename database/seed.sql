-- ============================================================================
-- AMSA SEED DATA — countries, 10 launch cities, service catalog, vendor types
-- subscription plans, loyalty tiers, notification templates, feature flags
-- ============================================================================
BEGIN;

-- Countries (Phase 1..3) -----------------------------------------------------
INSERT INTO geo.countries (code,name,dial_code,currency,timezone,languages,tax_model,psp_config,phase,is_active) VALUES
 ('NG','Nigeria','+234','NGN','Africa/Lagos','{en,ha,yo,ig,pcm}',
   '{"vat":0.075,"wht_vendor":0.05,"wht_desc":" withholding on vendor payouts where applicable"}',
   '{"priority":["paystack","flutterwave","monnify"]}',1,true),
 ('GH','Ghana','+233','GHS','Africa/Accra','{en,tw}',   '{"vat":0.15}', '{"priority":["paystack","flutterwave"]}',2,false),
 ('KE','Kenya','+254','KES','Africa/Nairobi','{en,sw}', '{"vat":0.16}', '{"priority":["flutterwave","paystack"]}',2,false),
 ('ZA','South Africa','+27','ZAR','Africa/Johannesburg','{en,zu,af}', '{"vat":0.15}', '{"priority":["flutterwave"]}',2,false),
 ('AE','UAE','+971','AED','Asia/Dubai','{en,ar}', '{"vat":0.05}', '{"priority":["flutterwave"]}',3,false),
 ('GB','United Kingdom','+44','GBP','Europe/London','{en}', '{"vat":0.20}', '{"priority":["flutterwave","monnify"]}',3,false),
 ('US','United States','+1','USD','America/New_York','{en,es}', '{"sales_tax":"varies"}', '{"priority":["flutterwave"]}',3,false);

-- Launch cities (Phase 1) ----------------------------------------------------
INSERT INTO geo.cities (id,country_id,code,name,state,timezone,center,coverage,is_active,launch_date) VALUES
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-LAG','Lagos','Lagos State','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(3.3792,6.5244),4326),NULL,true,'2026-10-01'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-ABJ','Abuja','FCT','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(7.4951,9.0579),4326),NULL,true,'2026-10-01'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-PHC','Port Harcourt','Rivers','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(7.0134,4.8156),4326),NULL,true,'2026-11-01'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-KAN','Kano','Kano State','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(8.5219,12.0022),4326),NULL,true,'2026-11-15'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-IBD','Ibadan','Oyo','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(3.9058,7.3775),4326),NULL,true,'2026-12-01'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-ONI','Onitsha','Anambra','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(6.7840,6.1415),4326),NULL,true,'2026-12-15'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-AWK','Awka','Anambra','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(7.0710,6.2075),4326),NULL,true,'2027-01-05'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-ENU','Enugu','Enugu State','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(7.5102,6.4423),4326),NULL,true,'2027-01-05'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-BNI','Benin City','Edo','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(5.6194,6.3350),4326),NULL,true,'2027-02-01'),
 (gen_random_uuid(),(SELECT id FROM geo.countries WHERE code='NG'),'NG-ASB','Asaba','Delta','Africa/Lagos',
   ST_SetSRID(ST_MakePoint(6.7333,6.2053),4326),NULL,true,'2027-02-01');

-- Service catalog ------------------------------------------------------------
INSERT INTO platform.service_categories (vertical,code,name,booking_mode,base_fare,price_model,cancellation_policy,sort_order) VALUES
 ('transportation','ride.economy','Economy Taxi','instant',800000,'{"per_km":12000,"per_minute":2000,"minimum":1200000,"currency":"NGN"}','{"grace_sec":60,"tiers":[{"within_min":5,"fee":0},{"within_min":10,"fee":50000},{"after":"fee":20,"pct":20}]}',10),
 ('transportation','ride.standard','Standard Taxi','instant',1200000,'{"per_km":16000,"per_minute":2500,"minimum":1800000}',NULL,20),
 ('transportation','ride.premium','Premium Taxi','instant',2000000,'{"per_km":24000,"per_minute":3500,"minimum":3000000}',NULL,30),
 ('transportation','ride.vip','VIP Taxi','instant',2800000,'{"per_km":32000,"per_minute":4500,"minimum":4000000}',NULL,40),
 ('transportation','ride.chauffeur','Executive Chauffeur','scheduled',6000000,'{"per_hour":7000000,"minimum":6000000}',NULL,50),
 ('transportation','ride.luxury','Luxury Cars','quote_based',15000000,'{"per_hour":25000000}',NULL,60),
 ('transportation','ride.suv','SUV','instant',2500000,'{"per_km":30000,"per_minute":4000,"minimum":3500000}',NULL,70),
 ('transportation','transport.corporate','Corporate Transportation','scheduled',0,'{"custom":true}',NULL,80),
 ('transportation','transport.event','Event Transportation','quote_based',0,'{"custom":true}',NULL,90),
 ('transportation','transfer.airport','Airport Transfer','scheduled',3000000,'{"per_km":28000,"fixed_zone_matrix":{}}',NULL,100),
 ('transportation','transfer.hotel','Hotel Transfer','scheduled',2500000,'{"per_km":26000}',NULL,110),
 ('transportation','transport.intercity','Intercity Travel','scheduled',15000000,'{"per_km":22000,"seat_based":true}',NULL,120),
 ('logistics','logistics.dispatch','Bike Dispatch','instant',1500000,'{"per_km":20000,"per_stop":300000,"minimum":2000000}',NULL,10),
 ('logistics','logistics.courier','Courier Service','instant',2000000,'{"per_km":22000}',NULL,20),
 ('logistics','logistics.parcel','Parcel Delivery','instant',1800000,'{"per_km":20000,"per_kg":150000}',NULL,30),
 ('logistics','logistics.document','Document Delivery','instant',1200000,'{"per_km":15000}',NULL,40),
 ('logistics','logistics.sameday','Same-Day Delivery','scheduled',2500000,'{"per_km":24000}',NULL,50),
 ('logistics','logistics.scheduled','Scheduled Delivery','scheduled',2000000,'{"per_km":20000}',NULL,60),
 ('logistics','logistics.multistop','Multi-Stop Delivery','instant',2500000,'{"per_km":20000,"per_stop":300000,"max_stops":8}',NULL,70),
 ('logistics','logistics.corporate','Corporate Logistics','scheduled',0,'{"custom":true}',NULL,80),
 ('logistics','logistics.fleet','Fleet Logistics','quote_based',0,'{"custom":true}',NULL,90),
 ('travel','flight.domestic','Domestic Flights','search',0,'{"gds":"amadeus","service_fee":150000}',NULL,10),
 ('travel','flight.international','International Flights','search',0,'{"gds":"amadeus","service_fee":450000}',NULL,20),
 ('travel','flight.multicity','Multi-City Flights','search',0,'{"gds":"amadeus","service_fee":450000,"max_legs":6}',NULL,30),
 ('travel','travel.package','Travel Packages','quote_based',0,'{"custom":true}',NULL,40),
 ('travel','travel.agency','Travel Agency Marketplace','quote_based',0,'{"custom":true,"escrow_until":"ticket_issued"}',NULL,50),
 ('aviation','jet.private','Private Jet Booking','quote_based',0,'{"custom":true,"commission_pct":8}',NULL,10),
 ('aviation','heli.charter','Helicopter Booking','quote_based',0,'{"custom":true,"commission_pct":8}',NULL,20),
 ('aviation','flight.charter','Charter Flights','quote_based',0,'{"custom":true,"commission_pct":8}',NULL,30),
 ('aviation','air.ambulance','Air Ambulance','quote_based',0,'{"custom":true,"commission_pct":6,"priority":"critical"}',NULL,40),
 ('aviation','aviation.executive','Executive Aviation','quote_based',0,'{"custom":true}',NULL,50),
 ('marine','marine.boat','Boat Charter','quote_based',0,'{"custom":true}',NULL,10),
 ('marine','marine.yacht','Yacht Charter','quote_based',0,'{"custom":true}',NULL,20),
 ('marine','marine.water_taxi','Water Taxi','instant',3500000,'{"per_km":40000}',NULL,30),
 ('security','security.exec_protection','Executive Protection Coordination','quote_based',0,'{"commission_pct":12,"verification":"5_layer"}',NULL,10),
 ('security','security.vip_escort','VIP Escort Coordination','quote_based',0,'{"commission_pct":12,"verification":"5_layer"}',NULL,20),
 ('security','security.convoy','Executive Convoy Coordination','quote_based',0,'{"commission_pct":12,"verification":"5_layer"}',NULL,30),
 ('security','security.driver','Security Driver Services','quote_based',0,'{"commission_pct":12,"verification":"5_layer"}',NULL,40),
 ('security','security.event','Event Security','quote_based',0,'{"commission_pct":12,"verification":"5_layer"}',NULL,50),
 ('security','security.corporate','Corporate Security','quote_based',0,'{"commission_pct":12,"verification":"5_layer"}',NULL,60),
 ('security','security.residential','Residential Security Coordination','quote_based',0,'{"commission_pct":12,"verification":"5_layer"}',NULL,70),
 ('security','security.airport','Airport Security Assistance','quote_based',0,'{"commission_pct":12,"verification":"5_layer"}',NULL,80),
 ('roadside','roadside.recovery','Vehicle Recovery','quote_based',0,'{"custom":true}',NULL,10),
 ('roadside','roadside.towing','Towing Requests','quote_based',3500000,'{"per_km":30000,"base_km_included":10}',NULL,20),
 ('roadside','roadside.mechanical','Emergency Mechanical Support','quote_based',2500000,'{"per_hour":5000000}',NULL,30),
 ('roadside','roadside.fuel','Fuel Delivery Assistance','instant',1500000,'{"per_litre":90000,"call_out":1000000}',NULL,40),
 ('roadside','roadside.tyre','Tire Replacement Assistance','quote_based',2000000,'{"per_tyre":4500000}',NULL,50),
 ('roadside','roadside.battery','Battery Assistance','quote_based',2000000,'{"call_out":1500000}',NULL,60),
 ('accommodation','hotel.search','Hotel Search','search',0,'{"provider":"marketplace"}',NULL,10),
 ('accommodation','hotel.booking','Hotel Booking','instant',0,'{"nightly":true}',NULL,20),
 ('accommodation','apartment.booking','Apartment Booking','instant',0,'{"nightly":true}',NULL,30),
 ('accommodation','shortlet.reservation','Short-Let Reservations','instant',0,'{"nightly":true}',NULL,40);

-- Subscription plans ---------------------------------------------------------
INSERT INTO platform.subscription_plans (tier,name,monthly_price,currency,max_listings,monthly_booking_cap,commission_discount_pts,payout_sla,features) VALUES
 ('free','Free',0,'NGN',2,20,0,'T+1','{"analytics":"basic","support":"community"}'),
 ('standard','Standard',950000,'NGN',10,500,1,'T+1','{"analytics":"standard","featured_slots":1,"promotions":true}'),
 ('professional','Professional',2750000,'NGN',NULL,NULL,2,'same_day','{"analytics":"advanced","featured_slots":5,"campaigns":true,"csm":true}'),
 ('enterprise','Enterprise',9500000,'NGN',NULL,NULL,3,'same_day_2x','{"analytics":"api","multi_branch":true,"sla":true,"csm":"dedicated"}');

-- Feature flags ---------------------------------------------------------------
INSERT INTO platform.feature_flags (key,description,enabled,scope) VALUES
 ('vertical.aviation.enabled','Consumer aviation booking (Phase 2)',false,'{"countries":[],"cities":[]}'),
 ('vertical.marine.enabled','Marine services consumer surface (Phase 2)',false,'{}'),
 ('payments.cod.enabled','Cash on delivery capped pilots',true,'{"countries":["NG"],"max_amount":15000000}'),
 ('ai.dynamic_pricing.enabled','Guardrailed surge engine',true,'{"cap":2.0,"floor":0.85}'),
 ('comms.video_consult.enabled','Video consultation rooms',true,'{}'),
 ('corporate.recurring.enabled','Recurring corporate bookings',true,'{}'),
 ('whatsapp.ai.enabled','WhatsApp Smart AI assistant (docs/26)',true,'{"countries":["NG"]}'),
 ('whatsapp.payments.links','In-chat secure payment links',true,'{"countries":["NG"]}'),
 ('roadside.vertical.enabled','Roadside assistance marketplace',true,'{"countries":["NG"],"cities":["NG-LAG","NG-ABJ"]}');

-- Notification templates (samples, en + 2 locales) ---------------------------
INSERT INTO platform.notification_templates (code,channel,locale,template,is_critical) VALUES
 ('booking.confirmed.customer','push','en','Your {{service}} is confirmed. {{vendor_name}} is on the way. Track live: {{link}}',false),
 ('booking.confirmed.customer','push','pcm','Your {{service}} don land. {{vendor_name}} dey come. Follow am here: {{link}}',false),
 ('booking.matched.customer','push','yo','{{driver_name}} ti gba irin-ajo re. {{eta_min}} iṣẹju.',false),
 ('otp.login','sms','en','Your AMSA code is {{code}}. Never share it.',true),
 ('otp.login','sms','ha','Lambar AMSA ta kai ita ce {{code}}. Kada ku raba ta.',true),
 ('escrow.held.customer','push','en','{{amount}} is safely held in escrow until your {{service}} is completed.',false),
 ('sos.confirm','sms','en','AMSA Safety: help is being arranged for {{name}}. Live location: {{link}}',true);

COMMIT;
