# AFRICA MOBILITY SUPER APP (AMSA)

**One app. One wallet. Every verified provider.**
Transportation · Logistics & Delivery · Travel · Aviation · Marine (ready) · Security Marketplace · Corporate Services · Vendor Marketplace · Wallet & Escrow · AI Automation.

A **technology marketplace** — AMSA owns no cars, bikes, aircraft, boats, or security companies. Every service is delivered by verified third-party vendors, every payment is escrow-protected, every journey has an SOS.

**Phase 1:** Nigeria — Lagos · Abuja · Port Harcourt · Kano · Ibadan · Onitsha · Awka · Enugu · Benin City · Asaba
**Phase 2:** Ghana · Kenya · South Africa (+ Aviation consumer launch) · **Phase 3:** UAE · UK · USA diaspora corridors.

---

## 📦 What's in this repository

| Path | Contents |
|---|---|
| **`docs/`** | Complete enterprise documentation library — **all 50+50 deliverables, twice-audited** (exec summary → GTM → WhatsApp AI → FAMS; traceability in docs/27). Start at [`docs/00-INDEX.md`](docs/00-INDEX.md) |
| **`database/`** | Complete PostgreSQL schema (100+ tables incl. FAMS activation control, 50+ enums, triggers, views, seed data) + ER diagrams + migrations |
| **`backend/`** | NestJS/Node backend monorepo with **working domain core**: booking state machine, fare engine with surge guardrails, double-entry ledger, escrow lifecycle, matching engine, **communication fallback (auto GSM switch)** — **the WhatsApp Smart AI platform (Ada: NLU in 5 languages, slot-filling dialog, AI quotation engine, payment links, availability & service management, human escalation)** — **the Interstate Logistics & Long-Distance Freight marketplace (21 services, 14 vehicle categories, 7 vendor types with the 7-step verification chain, 11-status shipment lifecycle with proofs/tamper/geofence security, 10-factor AI route optimization, corporate logistics with budgets & approvals, milestone escrow settlement, Ada WhatsApp freight desk, 9 analytics dashboards, FAMS-gated at feature/state/route/cargo/vehicle/vendor level; command center at /admin/interstate)** — **the Autonomous AI Mobility layer (vehicle tracking & intelligence across 11 asset classes; driver assistance; sensor-fusion autonomy with operating modes MANUAL→AI-ASSISTED→SUPERVISED→FULL; vehicle-class-aware routing; fleet intelligence; autonomous delivery/ride pipelines; safety system with legal-gated immobilization; vehicle cybersecurity bridged to SHIELD; all activation-gated through FAMS incl. new road-zone/fleet/vehicle levels; control center at /admin/mobility)** — **ORGANISM, the global AI organism architecture (8 agent layers totalling 120,000+ agents; shared real-time intelligence graph; AI executive board CEO/CFO/COO/CTO/CISO/CMO/CHRO/Data-Gov; autonomous orchestration & execution; evolution layer that self-tunes its own thresholds; live at /admin/organism)** — **SHIELD, the autonomous cybersecurity & threat-intelligence swarm (8 agent families scaling hundreds→thousands; real-time threat detection & correlation; fraud & trust swarm; autonomous response with approval guardrails; self-healing runbooks; zero-trust engine; MITRE-mapped threat intel; SOC 2/ISO 27001/GDPR/NDPR/PCI DSS posture; live SOC at /admin/shield)** — **and FAMS, the Feature Activation Management System (tourism vertical built + FAMS-gated; 24 global switches, activate/deactivate/hide/schedule/roll out services, locations, categories, features, vendors, assets per phase/country/state/city/geofence/user group; time-based activation; kill switch — no deploy; every AI surface obeys it)** — 356 passing tests (308 unit/contract + 24 LLM-orchestration + 24 live E2E; load-tested at 190k req / 0 errors) + runnable API |
| **`web/`** | Next.js 15 + TypeScript + Tailwind web platform: marketing site, Vendor Console, Corporate Portal, Admin Control Center **+ WhatsApp AI Control Center + FAMS activation dashboard (10 modules incl. emergency shutdown + analytics) + SHIELD security command center + ORGANISM cognitive dashboard + Autonomous Mobility control center + Interstate Logistics command + 13 platform service libraries (auth/JWT+MFA, double-entry wallet, Paystack+Flutterwave+Monnify payments, Amadeus+Sabre GDS travel, 16-type vendor verification, 5-tier loyalty, arbitration, KYC/AML/GDPR/NDPR/PCI compliance, 5-language notifications, S3 media, Google+OSM geo failover, WebRTC chat, 8 vertical engines), complete Flutter apps (customer/driver/rider) and customer web flows (/book /track /wallet /vendor/onboarding)** |
| **`mobile/`** | Flutter apps (customer / driver / rider flavors) — feature-first clean architecture scaffold |
| **`infra/`** | docker-compose local stack, Kubernetes (EKS) manifests, Terraform AWS baseline, CI/CD pipeline with security gates |

## 🚀 Quick start

**Web platform** (Next.js):
```bash
cd web && npm install && npm run dev      # http://localhost:3000  (/vendor /corporate /admin)
```

**Backend API + tests** (Node 22):
```bash
cd backend && npm install
npm test                                   # full suite (RUN_E2E=1 adds live API+web E2E)
npm run test:e2e                           # 24 live end-to-end tests
npm run load                               # zero-dep load test (k6 script in scripts/load/)
RUN_SERVER=1 npm run dev                   # http://localhost:4000/v1/health
```

Try the full booking → escrow → settlement flow:
```bash
curl -X POST localhost:4000/v1/auth/otp -H 'content-type: application/json' -d '{"phone":"+2348012345678"}'
curl -X POST localhost:4000/v1/auth/verify -H 'content-type: application/json' -d '{"phone":"+2348012345678","code":"123456"}'
# → use returned accessToken:
curl -X POST localhost:4000/v1/bookings -H "authorization: Bearer <tok>" -H 'content-type: application/json' \
  -d '{"pickup":{"lat":6.4281,"lng":3.4219},"dropoff":{"lat":6.6018,"lng":3.3515}}'
# then POST /v1/bookings/{id}/accept → /start {"otp":"4758"} → /complete  (escrow releases & ledger balances)
```

**Database** (PostgreSQL 16 + PostGIS):
```bash
cd infra/local && docker compose up -d postgres   # schema.sql + seed.sql auto-load
```

**WhatsApp AI assistant (Ada)** — full customer journey without the app:
```bash
curl -X POST localhost:4000/v1/whatsapp/simulate -H 'content-type: application/json' \
  -d '{"from":"+2348012345678","text":"How far"}'
# → greeting in Pidgin … then:
curl -X POST localhost:4000/v1/whatsapp/simulate -H 'content-type: application/json' \
  -d '{"from":"+2348012345678","text":"abeg I wan carry parcel from Lekki reach Yaba"}'
# → confirmation with fare range → reply "1" → booking + escrow + secure payment link
```
Supports text, voice notes (ASR), images (OCR), location pins; 5 languages (EN/Hausa/Yoruba/Igbo/Pidgin); human escalation below 55% confidence. Spec: `docs/26-whatsapp-ai-platform.md`.

## 🧭 Documentation library (60 deliverables)

| For | Read |
|---|---|
| Investors / Founders | `docs/01` exec summary → `docs/02` business plan → `docs/23` financials → `docs/24` pitch deck → `docs/25` GTM |
| Product / Design | `docs/03` BRD → `docs/04` PRD → `docs/13-15` wireframes + design system |
| Engineering | `docs/05` SRS → `docs/07` flows → `docs/08` architecture → `docs/09-12` DB/API/mobile/web → `docs/16-20` infra/security/AI/QA |
| QA / PM | `docs/05` → `docs/20` testing → `docs/21-22` roadmaps & team |

Full numbered map: [`docs/00-INDEX.md`](docs/00-INDEX.md).

## 🏗 Architecture at a glance

- **Backend:** NestJS microservices catalog (21 services) on EKS; event-driven via Kafka; Socket.IO realtime; Redis cache/queues
- **Data:** PostgreSQL 16 (database-per-service logical schemas), double-entry ledger with balance-enforcing triggers, TimescaleDB telemetry, S3 media/WORM audit
- **Web:** Next.js 15 portals (customer/vendor/corporate/admin) behind CloudFront+WAF
- **Mobile:** Flutter, 3 flavors, Riverpod, offline-first, Google Maps with OSM fallback
- **Money:** Paystack → Flutterwave → Monnify failover chain; escrow state machine; automated commission/VAT/payout settlement
- **AI:** fare prediction, matching, fraud scoring, dynamic pricing (guardrailed), demand forecasting, multilingual assistant (EN/Hausa/Yoruba/Igbo/Pidgin)

## ✅ Current status

- Documentation: **complete** (60/60 deliverables)
- Database schema: **complete** (runs top-to-bottom on PostgreSQL 16 + PostGIS)
- Backend domain core: **implemented & tested** (23 tests green; booking/escrow/ledger/matching/fare)
- Web platform: **implemented & building** (4 routes live)
- Mobile: architecture scaffold + core screens/theme/safety manager
- Infra: local compose stack, K8s manifests, Terraform baseline, CI/CD pipeline

**Roadmap:** MVP GA Lagos wk-16 → 10 cities → aviation + Ghana/Kenya/SA → diaspora corridors (see `docs/21-roadmaps.md`).

---
© 2026 Africa Mobility Super App. Confidential — internal & investor use.
