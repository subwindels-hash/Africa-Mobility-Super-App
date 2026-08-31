# 03 · Business Requirements Document (BRD)

**Deliverable:** 6 · **Author:** Business Analyst / Senior PM · **Version:** 1.0 · **Status:** Approved for build

---

## 1. Purpose

Define the business objectives, scope, stakeholders, and measurable success criteria for the Africa Mobility Super App (AMSA) platform, Phase 1 (Nigeria, 10 cities), with expansion-ready requirements for Phase 2 (Ghana, Kenya, South Africa) and Phase 3 (UAE, UK, USA).

## 2. Business Objectives (BRO-x)

| ID | Objective | Metric & Target (M18) |
|---|---|---|
| BRO-01 | Establish multi-vertical marketplace liquidity in 10 Nigerian cities | ≥ 6,500 active vendors/drivers; ≥ 250k installs; ≥ 85k MAU |
| BRO-02 | Make escrow the default payment trust mechanism | ≥ 80% of booking value via wallet/escrow |
| BRO-03 | Build the most-verified vendor network in African mobility | 100% vendors KYC-verified; verification SLA < 48h |
| BRO-04 | Become the default corporate mobility/logistics/security platform | ≥ 120 corporate accounts; ≥ 15% of GMV |
| BRO-05 | Achieve category-leading safety record | 100% trips with SOS + live-share available; critical incident response < 5 min |
| BRO-06 | Reach $28M cumulative GMV and $4.1M net revenue by M18 | Finance dashboard of record |
| BRO-07 | Localize for Nigeria's languages and payment reality | 5 languages live; 3 PSPs live; cash fallback capped at 15% of trips |
| BRO-08 | Prepare regulatory-grade compliance | NDPR/GDPR aligned; PCI DSS SAQ-A scope; audit logs complete |
| BRO-09 | Ship Phase-2 readiness (aviation, marine, multi-country) | Multi-currency/multi-tax/multi-timezone architecture proven in staging |

## 3. Scope

### 3.1 In Scope — Phase 1 (MVP → GA)

**Verticals & services**

1. **Transportation:** Economy, Standard, Premium, VIP taxi; Executive Chauffeur; Luxury; SUV; Corporate; Event; Airport transfers; Hotel transfers; Intercity.
2. **Logistics & Delivery:** Bike dispatch, courier, parcel, document, same-day, scheduled, multi-stop, corporate logistics, fleet logistics.
3. **Travel:** Domestic & international flights (one-way, return, multi-city via Amadeus/Sabre), travel packages, travel agency marketplace.
4. **Security Marketplace:** Executive protection, VIP escort, executive convoy, security drivers, event/corporate/residential security coordination, airport security assistance — with mandatory 5-layer verification.
5. **Wallet & Escrow:** Customer/vendor/driver/rider/corporate wallets; funding via Paystack/Flutterwave/Monnify; transfers; cashback; escrow with commission/tax/payout automation; refunds, disputes, arbitration.
6. **Corporate Portal:** Accounts, employees, departments, budgets, approvals, monthly billing, expense tracking, analytics.
7. **Loyalty:** Basic/Silver/Gold/Platinum/Executive tiers; cashback, points, discounts, priority support, VIP access.
8. **Vendor Subscriptions:** Free/Standard/Professional/Enterprise.
9. **Communication:** In-app chat (text, images, voice notes, PDFs/docs, location, read receipts, typing), voice calls, video calls (consultations), number masking, SMS/phone fallback.
10. **AI:** Fare prediction, route optimization, fraud detection, dynamic pricing, vendor matching, demand forecasting, AI support, voice-to-text, translation (EN/Ha/Yo/Ig/Pidgin), call summaries.
11. **Safety:** SOS, emergency calling, live trip sharing, trusted contacts, driver/rider verification, face verification, fraud monitoring.
12. **Admin Control Center & Analytics:** full back-office + revenue/bookings/growth/performance dashboards.

**Aviation & Marine:** schema, booking engine states, and vendor types ship in Phase 1 code as *quote-based* flows behind a feature flag; consumer launch in Phase 2.

### 3.2 Out of Scope — Phase 1

- Real aircraft ownership/operations (never in scope — marketplace only)
- AMSA-issued credit/loans (licensed partner products only, Phase 3)
- Food/restaurant delivery vertical
- Crypto payments
- USSD booking (Phase 2.5 — SMS fallback only in Phase 1)

## 4. Stakeholders

| Stakeholder | Interest | Engagement |
|---|---|---|
| Customers | Safe, reliable, fairly priced services | App, support, loyalty |
| Vendors (15 types) | Demand, fast payment, fair commission | Vendor console, CSMs |
| Drivers/riders | Earnings, safety, respect | Driver/Rider apps |
| Corporate clients | Control, compliance, savings | Corporate portal, account managers |
| Regulators (NDPC, CBN-adjacent PSPs, state transport authorities, NCAA for aviation marketing, NSCDC-adjacent security licensing) | Legal compliance | Legal/compliance officer, permits |
| Payment partners | Dispute rates, settlement integrity | Weekly reconciliation |
| Insurers | Risk data | Vendor insurance verification |
| Investors | Growth, unit economics | Monthly investor pack |

## 5. Business Requirements (BR-xxx)

### 5.1 Marketplace & Vendor

| ID | Requirement | Priority |
|---|---|---|
| BR-101 | Support 13 user types and 15 vendor types with distinct onboarding, verification, and capability paths | Must |
| BR-102 | Vendor registration with email, phone, OTP, KYC, identity, address, business (CAC), tax (TIN), bank, license, insurance, compliance verification; admin approval before activation | Must |
| BR-103 | Asset registry (cars, motorcycles, aircraft, boats) with photos, videos, documents, pricing rules, availability calendar, maintenance records, insurance records, capacity | Must |
| BR-104 | Multi-vendor matching with automatic dispatch and quote-based RFQ flow for premium/aviation | Must |
| BR-105 | Vendor subscription tiers gating features and commission | Must |
| BR-106 | Vendor scorecards (acceptance rate, completion, ratings, SLA) driving matching priority | Must |

### 5.2 Booking & Operations

| ID | Requirement | Priority |
|---|---|---|
| BR-201 | Booking types: instant, scheduled, corporate, recurring, quote-based | Must |
| BR-202 | Booking workflow state machine enforced platform-wide (see `07-process-flows.md`) | Must |
| BR-203 | Maps/GPS: Google Maps primary, OSM fallback; tracking, ETA, traffic, heat maps, geofencing, coverage maps, emergency location sharing | Must |
| BR-204 | Route optimization for multi-stop delivery | Must |
| BR-205 | Intercity and multi-city itineraries | Should |

### 5.3 Payments, Escrow & Wallet

| ID | Requirement | Priority |
|---|---|---|
| BR-301 | Five wallet types (customer, vendor, driver, rider, corporate) with ledger of record | Must |
| BR-302 | Paystack + Flutterwave + Monnify integrations with failover routing | Must |
| BR-303 | Escrow hold → release with commission deduction, tax computation, automated vendor payout | Must |
| BR-304 | Partial/full refunds, chargebacks, disputes, arbitration workflow with SLA timers | Must |
| BR-305 | Multi-currency pricing & settlement scaffolding (NGN live; GHS/KES/ZAR/AED/GBP/USD Phase 2/3) | Must |
| BR-306 | Cashback & rewards accrual/redemption engine | Should |

### 5.4 Trust, Safety & Compliance

| ID | Requirement | Priority |
|---|---|---|
| BR-401 | 5-layer verification mandatory for security providers; admin approval gate | Must |
| BR-402 | SOS with 24/7 response protocol; emergency services integration; trusted contacts; live trip share | Must |
| BR-403 | Face verification for driver/rider daily activation and high-risk bookings | Must |
| BR-404 | Fraud monitoring (device fingerprinting, velocity rules, ML scoring) | Must |
| BR-405 | NDPR/GDPR data subject rights; consent capture; retention & deletion workflows | Must |
| BR-406 | Immutable audit logs for all money/state/admin actions | Must |
| BR-407 | PCI DSS scope minimization (SAQ-A; card data only in PSP-hosted flows) | Must |

### 5.5 Growth & Retention

| ID | Requirement | Priority |
|---|---|---|
| BR-501 | Loyalty tiers with benefits engine | Should |
| BR-502 | Promotions: promo codes, referral program, vendor-funded discounts | Must |
| BR-503 | Corporate portal with budget/approval controls and monthly invoicing | Must |
| BR-504 | Analytics dashboards for finance, ops, vendors, corporates | Must |

## 6. Constraints & Assumptions

| Type | Statement |
|---|---|
| Constraint | Launch regulated ride-hail permits per city before marketing; wallet/escrow via licensed PSP partners (no unlicensed deposit-taking) |
| Constraint | MVP timeline 16 weeks to GA in Lagos |
| Assumption | Google Maps API budget & quota approved; OSM fallback keeps service functional |
| Assumption | Vendor verification API partners available for NIN/BVN/CAC/TIN |
| Assumption | Amadeus/Sabre sandbox credentials for travel vertical |

## 7. Success KPIs

| KPI | M6 | M12 | M18 |
|---|---|---|---|
| GMV (cumulative) | $2.8M | $12M | $28M |
| Net revenue (cumulative) | $0.35M | $1.7M | $4.1M |
| Active vendors/drivers/riders | 1,200 | 4,000 | 6,500 |
| MAU | 18k | 55k | 85k |
| Completed bookings/mo | 60k | 210k | 380k |
| Escrow adoption (% GMV) | 70% | 78% | 82% |
| Verification SLA <48h | 90% | 95% | 97% |
| Fraud loss (% GMV) | <0.8% | <0.5% | <0.4% |
| Support AI containment | 40% | 60% | 70% |

## 8. Approval

| Role | Name | Date | Signature |
|---|---|---|---|
| CEO | | | |
| CPO | | | |
| CFO | | | |
| Head of Engineering | | | |
