# 28 · FAMS — Feature Activation Management System

**Purpose:** One centralized control plane where admins **activate, deactivate, hide or gradually roll out** any service, location, feature, vendor or asset — **without software updates and without code changes**. Every module is built from day one; what customers see and can book is decided by FAMS rules, per country / state / city / region / user group.

**Status:** Implemented (engine + API + middleware + WhatsApp AI obedience + admin dashboard + DB schema) · Tests: 21 engine + 14 integration green.
**Code:** `backend/libs/fams/src/` · `backend/apps/api/main.ts` (FAMS section) · `web/app/admin/fams/` · `database/migrations/004-fams.sql`

---

## 1. Why FAMS exists

Launching a 10-vertical super app country-by-country means availability is **not a code question** — it is an operations question:

- Benin City has no heliport clearance → aviation must be OFF there, on for Lagos.
- Kenya launch is 3 months out → transportation/logistics OFF for `+254` users, today.
- A vendor's insurance lapses → suspend that vendor in seconds, not sprints.
- A VIP fleet goes for maintenance → hide the `ride.vip` category until it returns.
- A promo must run 01 Nov 2026 → 31 Jan 2027 → schedule it, walk away.

FAMS turns all of these into **data**, evaluated on every request. The canonical customer-facing answer when something is off is exactly:

> **"Service currently unavailable in your location."**

## 2. Core concepts

| Concept | Values / meaning |
|---|---|
| **Activation value** | `on` · `off` · `hidden` (not marketed, API-invisible) · `maintenance` (temporary, surfaced as maintenance) · `beta` (available to opted-in groups) |
| **Scope levels (precedence)** | asset **70** > vendor **60** > category **50** > city **40** > state **30** > country **20** > global **10** |
| **Group bonus** | +15 weight for user-group-scoped rules (a `beta`-only rule beats a plain rule at the same level) |
| **Tie-break** | most recent decision wins (monotonic `version` counter — never wall-clock ties) |
| **Kill switch** | emergency stop overrides *every* rule including city-ON, effective on the next request, no deploy |
| **Availability** | `value ∈ {on, beta}` → available; everything else → blocked with the canonical message |

**Override semantics (deliberate):**

- Not-yet-started rule → **skipped** (a future "ON" doesn't leak today).
- Expired rule that said ON → **effective OFF** (never silently fall back to parent-ON).
- Geofenced rule with the user outside the fence → **OFF** (never default-ON).
- User group / rollout % excluded → `available: false` with a cohort reason (soft exclusion).
- City **ON** beats state **OFF** beats country **OFF** — deepest scope wins.

## 3. What can be controlled

- **Global:** all 18 platform modules — transportation, logistics, travel, aviation, security, accommodation, roadside, corporate, marine, payments, wallet, escrow, WhatsApp AI, AI dynamic pricing, video calling, loyalty, subscriptions, promotions.
- **Country / State / City:** e.g. aviation OFF in NG-ED (Edo) & NG-ASB (Asaba); transportation+logistics OFF in KE; security OFF in GH.
- **Service categories:** Economy / Standard / Premium / **VIP Taxi** / Chauffeur … (`ride.vip` currently `maintenance`).
- **Vendors:** `active` / `suspended` / `pending_review` / `maintenance` (vnd_b suspended, vnd_c maintenance in seed).
- **Assets:** vehicle / motorcycle / helicopter / jet / boat — per class or per tail-number (`ast_jet_b` OFF in seed).
- **Feature flags:** AI Dynamic Pricing, WhatsApp AI Assistant, Video Calling, Wallet, Escrow (+ next-gen assistant ON only for `beta`,`vip` groups).
- **Phased launch:** Phases 1–5 presets (Phase 4 active — marine still OFF; Phase 5 = UAE/UK/USA).
- **User groups:** customers / vendors / corporate / beta / VIP.
- **Time-based:** activate 01 Jan 2027 00:00, deactivate 31 Jan 2027 23:59 (`scheduled_activations` + scheduler `tick()`).
- **Geofenced:** e.g. Airport Transfer bookable **only inside** the MMIA geofence (6.5774, 3.3212, 15 km).

## 4. Request pipeline (spec workflow)

```
User Request → Feature Activation Engine → Location Validation →
Feature Flag Validation → Vendor Availability Validation → Booking Engine
```

Implemented as Express middleware in `backend/apps/api/main.ts`: `/v1/bookings*` passes through `famsMiddleware` **before** pricing, dispatch or escrow. When a gate is OFF the caller receives `403 SERVICE_UNAVAILABLE` with the canonical message and the decision trace (source rule, reason).

## 5. API (live on the demo service)

| Endpoint | Purpose |
|---|---|
| `GET /v1/feature-flags` | evaluate the 5 spec flags for a context + list feature rules |
| `POST /v1/feature-flags` | create flag rule (level/selector/value/userGroups/rolloutPct/window/geofence) |
| `PUT /v1/feature-flags/:id` · `DELETE /v1/feature-flags/:id` | update / remove |
| `GET /v1/service-availability` | per-context matrix for all 8 verticals + 5 features |
| `POST /v1/service-availability` · `PUT /v1/service-availability/:id` | create / update location gates |
| `GET /v1/fams/rules` | full catalog: rules, 18 modules, categories, phases, cities |
| `GET`/`POST /v1/fams/emergency` | kill switch list / arm / clear (`target: "vertical:aviation"`) |
| `GET`/`POST /v1/fams/schedules` · `POST /v1/fams/tick` | time-based activations + scheduler run |
| `GET /v1/fams/health` | rules / emergencies / schedules counters |

Writes require an admin session (RBAC in production); every change is audit-logged (`fams.audit_log`).

## 6. AI obedience — WhatsApp Ada respects every setting

`backend/libs/whatsapp/src/orchestrator.ts` evaluates FAMS on **every** path:

- **Intent-time gate:** booking intents map to verticals (taxi/chauffeur→transportation, delivery→logistics, flights→travel, security→security, roadside→roadside, accommodation→accommodation, aviation→aviation, corporate→corporate_services) and are gated *before* a draft is created — city/state inferred from the gazetteer, country from the phone (`+254`→KE, `+233`→GH, else NG).
- **Confirmation-time re-gate:** the final "yes" re-checks with the destination city (a slot may be the first time Benin City appears).
- **Recommendations filtered:** greetings and "what's available in …" answers list **only** FAMS-enabled verticals for that city — Ada never recommends a helicopter where aviation is OFF.
- **Blocked reply:** explains the state (off / maintenance / not offered), carries the canonical message verbatim, and offers up to 5 alternatives that *are* live.

## 7. Database (migration `004-fams.sql`, schema `fams`)

10 tables — `services`, `states`, `feature_flags`, `service_availability`, `feature_rollouts`, `vendor_activation` (Active/Suspended/Pending Review/Maintenance), `asset_activation` (vehicle/motorcycle/helicopter/jet/boat), `scheduled_activations`, plus `emergency_stops` and `audit_log`. `geo.countries` / `geo.cities` are reused from 001; `fams.states` adds the state layer. Seeded to mirror the engine demo (KE transport/logistics off, GH security off, NG-ED aviation off, ride.vip maintenance, marine off until Phase 5, GH flights activate 01 Jan 2027). Canonical `schema.sql` now carries all 96 tables.

## 8. Admin dashboard — `/admin/fams`

The nine spec modules: **Service Control · Country · State · City · Vendor · Asset · Feature Flags · Rollout Management · Emergency Shutdown** — plus the request-pipeline explainer and the canonical-message contract. Kill-switch cards are armed per domain (transportation, logistics, travel, aviation, security, payments, wallet, escrow, WhatsApp AI).

## 9. Verification

- `backend/tests/fams.test.ts` — 21 engine tests (precedence, expiry, geofence, cohorts, kill switch, scheduler).
- `backend/tests/fams-api.test.ts` — 14 integration tests (spec endpoints CRUD, middleware 403 + canonical message, kill switch round-trip, schedule→tick, Ada obedience incl. no-helicopter-in-Benin-City).
- Demo receipts: `POST /v1/bookings/estimate {"country":"KE"}` → 403 canonical; NG → 200; arm `vertical:transportation` → NG 403; clear → 200.
