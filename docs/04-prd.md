# 04 · Product Requirements Document (PRD)

**Deliverable:** 7 · **Author:** CPO / Senior Product Manager · **Version:** 1.0

---

## 1. Product Overview

AMSA is a multi-vertical marketplace super app. The PRD defines the product goals, personas, information architecture, and functional feature specifications per module with MoSCoW priorities and acceptance criteria anchors. Detailed requirement numbering (FR/NFR) lives in `05-srs.md`; flows in `07-process-flows.md`.

### 1.1 Product Goals (PG)

| PG | Goal | Measure |
|---|---|---|
| PG-1 | One app replaces 5+ for mobility/logistics/travel/security | ≥ 2.4 verticals used per active customer (M18) |
| PG-2 | Trust is visible | 100% vendor profiles show verification badges; booking screen shows escrow state |
| PG-3 | Fast dispatch | Median match < 60s (taxi), < 5 min (courier), quote SLA < 2h (aviation/security) |
| PG-4 | Safe by default | SOS reachable in ≤ 2 taps from any active service screen |
| PG-5 | Accessible to Nigeria | Full UX in 5 languages; works on 2G-class devices (app < 40MB, offline tolerance) |

### 1.2 Personas

| Persona | Profile | Jobs-to-be-done | Pain today |
|---|---|---|---|
| **Amaka, 29, banker (Lagos)** | Commutes daily, orders parcels, books flights monthly | Get to work safely; send documents; book travel with escrow | Multiple apps; driver quality varies; no payment protection for agents |
| **Emeka, 41, SME owner (Onitsha)** | Ships goods to Lagos weekly | Same-day, tracked multi-stop logistics | Cash risk, unreliable dispatch, no invoices |
| **Fatima, 35, exec assistant (Abuja)** | Arranges exec transport + protection | Book chauffeur + VIP escort for visiting CEO | Broker calls, no verification, prepayment risk |
| **Tunde, 27, fleet owner (Ibadan)** | 6 cars + 4 bikes | Get corporate demand, guaranteed payout | Commission disputes, late payments |
| **Chidi, 31, dispatch rider (Enugu)** | Owns bike | Steady order flow, fair pay, safety | Dead miles, fuel risk, rider abuse |
| **Zainab, 26, traveller (Kano)** | Flies domestic monthly | Compare + book safely, ground transfer attach | Fake agents, no refund recourse |
| **Bisi, 45, ops manager (corporate)** | Manages 300 staff travel & courier | Budgets, approvals, spend analytics | Excel + paper receipts, policy leakage |
| **Ada (diaspora, London)** | Pays for parents' needs in Nigeria | Book/pay for rides & deliveries from UK | Trust gap, FX friction |

## 2. Information Architecture (Customer App)

```
AMSA Customer
├── Home (multi-service launcher)
│   ├── Ride (Economy→Luxury, Airport, Hotel, Intercity, Event)
│   ├── Send (Dispatch, Parcel, Courier, Document, Multi-stop, Fleet)
│   ├── Fly (Domestic, International, Multi-city, Packages)
│   ├── Charter (Jets, Helicopters, Air Ambulance)  [flag: Phase 2]
│   ├── Protect (Executive Protection, Escort, Convoy, Event/Residential)
│   └── Corporate  (if member)
├── Activity (Bookings: active/history/receipts)
├── Wallet (balance, fund, transfer, cards, rewards)
├── Chat (threads with vendors/drivers)
├── Safety (SOS, trusted contacts, trip sharing)
└── Account (profile, KYC, loyalty tier, family/diaspora links, language)
```

## 3. Feature Specifications by Module

### 3.1 Accounts & Onboarding (all apps)

| Feature | Spec | Priority |
|---|---|---|
| Sign-up | Phone-first (OTP via SMS/WhatsApp fallback), email optional; password or OTP-login | Must |
| MFA | TOTP + SMS OTP step-up for money actions | Must |
| KYC ladders | L1 phone; L2 BVN/NIN + selfie; L3 address; corporate: CAC + directors | Must |
| Face verification | Liveness check for drivers/riders daily & random; for customers on high-value bookings | Must |
| Multi-account | One identity; role switcher (customer↔driver↔rider↔vendor staff) with separate app contexts | Must |

### 3.2 Ride Module

| Feature | Spec | Priority |
|---|---|---|
| Class selector | Economy/Standard/Premium/VIP/Executive/Luxury/SUV with per-class ETA & fare estimate | Must |
| Fare estimate | AI fare prediction w/ surge transparency badge & fare range | Must |
| Instant booking | Auto-match nearest verified vendor asset; 15s offer timeout → cascade | Must |
| Scheduled | Up to 30 days ahead; reminder notifications; vendor pre-assignment window | Must |
| Intercity | Route picker, seat options, return booking | Should |
| Airport/hotel | Terminal/gate picker, flight number attach, meet & greet option | Should |
| Live tracking | Driver location, ETA, route, share link (expiring) | Must |
| Trip extras | Stops (≤3), child seat note, priority pickup, wait time billing | Should |
| Payment | Wallet, card (PSP-hosted), transfer, capped cash; corporate auto-charge | Must |
| Post-trip | Rating (1–5) + tags, tip, receipt PDF, complaint w/ 72h SLA | Must |

### 3.3 Logistics Module

| Feature | Spec | Priority |
|---|---|---|
| Package details | Size/weight wizard with photo, declared value, fragile flag | Must |
| Service levels | Dispatch (<90min), same-day, scheduled, multi-stop (≤8 stops, AI-optimized sequence) | Must |
| Recipient UX | Recipient tracking link + OTP release code at handover | Must |
| Proof of delivery | Photo + signature + geo-tagged timestamp | Must |
| Fleet/corporate | Bulk manifest upload (CSV), dedicated rider pools, monthly billing | Should |

### 3.4 Travel Module

| Feature | Spec | Priority |
|---|---|---|
| Flight search | Amadeus primary/Sabre failover; one-way/return/multi-city; flexible dates ±3d | Must |
| Booking & ticketing | Passenger details, seat/meals where supported, e-ticket to wallet/email | Must |
| Escrow for agents | Agency marketplace bookings held in escrow until ticket issued | Must |
| Packages | Bundled flight+hotel+tour listings by verified agencies | Should |
| Attach | Auto-suggest airport transfer & hotel booking post-ticket | Should |

### 3.5 Security Marketplace

| Feature | Spec | Priority |
|---|---|---|
| Service catalog | Executive protection, VIP escort, convoy, security driver, event, corporate, residential, airport assistance | Must |
| Quote flow | RFQ with scope builder (personnel count, hours, route risk, assets); ≤3 vendor quotes; admin-screened | Must |
| Verified badges | License, insurance, compliance checks displayed with expiry monitoring | Must |
| Retainers | Corporate monthly retainers w/ milestone escrow releases | Should |
| Ops room | Vendors run ops from Security Dashboard: roster, deployment logs, incident reports | Should |

### 3.6 Wallet & Escrow

| Feature | Spec | Priority |
|---|---|---|
| Wallets | Customer/vendor/driver/rider/corporate; double-entry ledger; balance + pending | Must |
| Funding | Card/transfer/USSD-initiated via Paystack→Flutterwave→Monnify failover chain | Must |
| Transfers | P2P wallet transfer; withdrawal to bank (instant for Pro+; T+1 otherwise) | Must |
| Escrow states | FUNDED → HELD → PARTIAL_RELEASED → RELEASED / REFUNDED; visible to parties | Must |
| Payouts | Automated post-release; same-day windows for subscription tiers | Must |
| Disputes | Evidence upload, arbitration queue, SLA timers, refund/partial matrices | Must |
| Statements | PDF/CSV statements; tax invoice generation (VAT 7.5% NG where applicable) | Must |

### 3.7 Communication

| Feature | Spec | Priority |
|---|---|---|
| Chat | Text, images, voice notes, PDFs, docs, location; read receipts; typing indicators | Must |
| Voice calls | In-app (WebRTC) with number masking; PSTN fallback via masking proxy | Must |
| Video calls | Consultations: travel, security, vendor; scheduled or instant | Should |
| Fallback | Poor-quality detection → offer direct call via masked number or SMS template | Must |

### 3.8 AI Features

| Feature | Spec | Priority |
|---|---|---|
| Fare prediction | Range + confidence; surge explanation | Must |
| Route optimization | Multi-stop sequencing (saves ≥15% distance vs naive) | Must |
| Fraud detection | Real-time risk score on wallet/booking events; step-up challenges | Must |
| Dynamic pricing | Guardrailed supply-demand pricing (cap 2.0×, floor 0.85×; transparent) | Should |
| Vendor matching | Composite score: distance, rating, acceptance, tier, capacity | Must |
| Demand forecasting | 15-min city heatmaps for driver positioning & promo targeting | Should |
| AI support | In-app assistant EN/Ha/Yo/Ig/Pidgin; deflection to human w/ context | Should |
| Voice-to-text | Voice note transcription in chat & support | Should |
| Translation | Real-time chat translation across 5 languages | Should |
| Call summaries | Post-call summary + action items logged to thread | Nice |

### 3.9 Safety

SOS (2-tap), emergency calling (local PSAP + AMSA response), live trip sharing, trusted contacts (auto-notify on night trips), verification chain display, anomaly alerts (route deviation, unscheduled stops), fraud monitoring. Full protocol in `07-process-flows.md` §6.

### 3.10 Corporate Portal

Company onboarding (CAC, docs), employee directory & departments, budget pools per dept/category, booking on behalf, approval chains (threshold-based), monthly consolidated billing, expense export, analytics, policy rules (class caps, vendor allowlists, curfews).

### 3.11 Loyalty

Tiers Basic→Executive on rolling 90-day spend; points (1 pt/₦100), cashback (0.5–3% by tier), discounts, priority support, VIP access (event lanes, airport fast-track via partners).

### 3.12 Admin Control Center

User/vendor/driver/rider management, KYC review queues, verification approvals, booking oversight, escrow/payout ops, refunds/disputes, promotions engine, fraud console, analytics, CMS (service categories, cities, coverage), audit log viewer, role admin.

## 4. Release Plan

| Release | Scope | Gate |
|---|---|---|
| R0 Internal (Wk 6) | Auth, wallets (sandbox), ride booking E2E on staging | 100 P0 test cases pass |
| R1 Alpha Lagos (Wk 10) | Rides + dispatch logistics, 50 vendors, escrow sandbox | Match rate > 85%, crash-free > 99% |
| R2 Beta (Wk 14) | Travel, security RFQ, chat+calls, corporate pilot (5 accounts) | Escrow reconciliation 100% |
| R3 GA Lagos (Wk 16) | Full Phase-1 verticals, 3 PSPs live, loyalty, AI pricing | All P0/P1 defects closed; DR drill passed |
| R4 Cities 2–10 (Wk 18–26) | City-by-city activation gates | Per-city ops checklist |
| R5 Phase 2 (M12+) | Aviation consumer launch, marine, Ghana/Kenya/SA | Regulatory + verification readiness |
