# 32 · Interstate Logistics & Long-Distance Freight Services

**Purpose:** A nationwide logistics marketplace connecting customers and businesses with **verified logistics companies, transport operators, truck owners, fleet operators and independent transport providers** for interstate cargo transportation. **The platform owns no trucks** — every transportation service is provided by verified third-party logistics partners.

**Status:** Implemented (engine + FAMS/escrow/WhatsApp/ORGANISM integration + API + admin command center + 16-table schema). Tests: 35 interstate — full suite **237 green**.
**Code:** `backend/libs/interstate/src/` · `backend/apps/api/main.ts` (INTERSTATE section) · `web/app/admin/interstate/` · `database/migrations/010-interstate-logistics.sql`

**Integrated with (not standalone):** Logistics & Delivery · Fleet Management (mobility trucks/telematics) · Vendor Marketplace (7 vendor types, 7-step verification) · Corporate Portal · Customer Mobile App · Driver App · Vendor Dashboard · AI Intelligence Platform (ORGANISM graph) · Wallet & Escrow (core domain milestones) · WhatsApp Smart AI Assistant (Ada) · Maps & GPS · **FAMS** (everything gated).

---

## Services (21)

FTL · LTL · Shared Cargo · Bulk Cargo · Container · Refrigerated (Cold Chain) · Heavy Equipment · Construction Material · Agricultural Produce · FMCG Distribution · Manufacturing · Warehouse-to-Warehouse · B2B · B2C · Government · NGO & Humanitarian · Medical & Pharmaceutical · E-commerce Line Haul · Livestock (where legally permitted) · Vehicle Transportation · Machinery.

## Vehicle categories (14)

Mini Van · Cargo Van · Pickup Truck · Light/Medium/Heavy Truck · Flatbed · Box Truck · Refrigerated Truck · Tanker · Low Loader · Container Truck · Articulated Trailer · Specialized Heavy Haul. Each carries **capacity, dimensions, max weight, cargo-type support** (utilization-first matching: the smallest eligible vehicle wins — test-pinned), plus per-unit **insurance, maintenance records, availability calendar, operating regions** (`interstate.freight_vehicles`).

## Booking options (8) & stops

Instant · Scheduled · Quotation request · **Compare multiple providers** · One-way · Return trip · Recurring (weekly/monthly) · Dedicated fleet. Single/multi-pickup and single/multi-destination stops are sequenced pickups-before-dropoffs (test-pinned).

## Shipment management

Tracks Shipment ID · cargo type · cargo value · weight · dimensions · pickup/delivery locations · assigned vehicle & driver · status · ETA · delivery confirmation across the **11 spec statuses** (quote_requested → quote_accepted → awaiting_pickup → driver_assigned → cargo_loaded → in_transit → checkpoint_update → delivered → completed / cancelled / disputed) with an enforced transition machine (illegal jumps refused, test-pinned).

## AI route optimization (10 factors) & recommendations

Distance · traffic · road quality · weather · security advisories · vehicle restrictions · **weight restrictions (axle limits exclude corridors)** · toll roads · fuel efficiency · delivery deadlines. The AI recommends **best route + best vehicle + best logistics provider + estimated cost + estimated delivery time** with rationale (test-pinned), and quotes compare multiple verified providers ranked by rating and on-time record.

## Live tracking & cargo security

Real-time GPS · live position · ETA updates · checkpoint notifications · route playback (`interstate.tracking_events`) · geofence monitoring (violations raise alerts, test-pinned) · arrival + delivery notifications · **shareable tracking links** with recipients and TTL. Security: shipment insurance · **tamper alerts (seal state)** · geofence alerts · driver identity verification · cargo verification · proof of pickup/delivery with **digital signatures + photo confirmation** (test-pinned).

## Corporate logistics

Corporate accounts → departments (budgets + approvers) → transport requests with **approval workflow and budget enforcement** (over-budget approvals refused, test-pinned) → booking → invoices → analytics.

## Vendor management

7 vendor types: Trucking Companies · Fleet Operators · Independent Truck Owners · Freight Brokers · Warehouse Operators · Cold Chain Operators · Distribution Companies. Each completes the **7-step verification chain** — business, identity, tax, insurance, vehicle, driver, compliance approval (admin) — and is marketplace-listed **only when every step is approved** (test-pinned; booking refuses unverified or FAMS-disabled vendors).

## Payments & escrow (core domain integration)

Instant payments · escrow · corporate billing · partial payments · **milestone payments** (40% loaded / 60% delivered, released through the real escrow engine) · automatic vendor settlement · platform commission (12%) · tax (7.5% VAT) · refund management on cancellation. Journal-integrated: customer pays platform → platform holds → commission+tax deducted → vendor auto-payout.

## WhatsApp Smart AI (Ada)

New intents `book_interstate` + `track_shipment` (weight 4, localized cargo phrases). Customers request interstate shipping, get compared quotations, upload cargo photos, share pickup/delivery locations, track shipments and receive ETA updates — and Ada **automatically recommends the most suitable provider** by cargo type, route, pricing (cold-chain/permit/urgency/security/LTL-aware) and availability. FAMS blocks surface as friendly unavailability messages.

## Analytics (9 dashboards)

Interstate revenue (+commission) · shipment volume · active routes/corridors · vehicle utilization · vendor performance · delivery success rate · average delivery time · customer satisfaction · fleet performance.

## Feature activation (FAMS) — no code changes to toggle

- **Interstate Logistics** `ilst.marketplace` — ON nationwide
- **Cargo Categories** `cargo.*` — per-category rules
- **Vehicle Types** `veh.*` — e.g. Tanker OFF pending HSE review (seeded)
- **States** `ilst.state.*` — state-level rules (origin or destination)
- **Routes** `route.NG-LAG-NG-KAN` — corridor categories (seeded 4 corridors)
- **Logistics Vendors** — vendor-level vertical rules (verified + FAMS-active required)
- **Corporate Logistics** `ilst.corporate` — ON
- **Permitted cargo** `ilst.permitted_cargo` — livestock/heavy-haul OFF globally, ON in Kano & Kaduna (legally permitted, seeded)
- **Cross-Border Logistics** `ilst.cross_border` — OFF (future)

## Future expansion (structurally ready)

Cross-Border African Logistics (`interstate.corridors.cross_border` + `partner_country`) · Regional Freight Corridors · Customs Documentation · Import & Export · International Freight Forwarding · Air/Marine/Rail Cargo (multi-leg corridors) · Multi-Modal Logistics · AI Predictive Supply Chain (ORGANISM graph observes every quote/booking/settlement/security signal). All behind FAMS gates — activation is configuration, never code.

## Database (migration 010, schema `interstate` — 16 tables)

`vehicle_categories` (14 seeded), `freight_vehicles`, `vendor_verifications` (generated `active` column = all 7 steps approved), `shipments`, `shipment_stops`, `quotes`, `tracking_events`, `tracking_links`, `cargo_inspections`, `shipment_insurance`, `corporate_accounts`, `corporate_departments`, `corporate_approvers`, `transport_requests`, `corporate_invoices`, `corridors` (4 seeded). Canonical schema: **152 tables**.

## API (live)

| Endpoint | Purpose |
|---|---|
| `GET /v1/interstate/catalog` | 21 services · 14 vehicles · vendor types · statuses · options |
| `GET/POST /v1/interstate/vendors` (+`/:id/verification`) | registration + 7-step verification decisions |
| `POST /v1/interstate/quote` | multi-provider comparison (FAMS-gated) |
| `POST /v1/interstate/recommend` | AI route+vehicle+provider+cost+ETA bundle |
| `POST /v1/interstate/book` | book (instant/scheduled/recurring/corporate) with escrow |
| `GET /v1/interstate/shipments` (+`/:id`, `/:id/status`, `/:id/checkpoint`, `/:id/proof`, `/:id/tracking-link`, `/:id/rate`) | full lifecycle |
| `POST/GET /v1/interstate/corporate/*` | accounts · requests · approvals |
| `GET /v1/interstate/analytics` | the 9 dashboards |
| WhatsApp `POST /webhooks/whatsapp` | "20 tonnes of cement from Lagos to Kano" → Ada quotes |

## Verification

`backend/tests/interstate.test.ts` (35): catalog completeness (21/14/7/7), utilization-first matching, reefer enforcement, verification chain gating, FAMS gates (marketplace/state/cargo/vehicle/permitted-cargo/cold-chain), booking options, stop sequencing, full lifecycle with proofs, illegal transitions, route recommendation + weight restrictions, pricing multipliers, geofence + tamper alerts, tracking links, escrow milestones + refund + settlement split, corporate approvals/budgets/invoices, all 9 analytics dashboards, WhatsApp parsing/tracking/blocking.
