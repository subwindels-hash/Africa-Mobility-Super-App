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
| **`docs/`** | Complete enterprise documentation library — **all 60+ deliverables** (exec summary → GTM → WhatsApp AI platform). Start at [`docs/00-INDEX.md`](docs/00-INDEX.md) |
| **`database/`** | Complete PostgreSQL schema (96+ tables incl. FAMS activation control, 50+ enums, triggers, views, seed data) + ER diagrams + migrations |
| **`backend/`** | NestJS/Node backend monorepo with **working domain core**: booking state machine, fare engine with surge guardrails, double-entry ledger, escrow lifecycle, matching engine, **communication fallback (auto GSM switch)** — **the WhatsApp Smart AI platform (Ada: NLU in 5 languages, slot-filling dialog, AI quotation engine, payment links, availability & service management, human escalation)** — **and FAMS, the Feature Activation Management System (activate/deactivate/hide/roll out services, locations, features, vendors, assets per country/state/city/user group; time-based + geofenced activation; kill switch — no deploy; the AI obeys it)** — 103 passing tests + runnable API |
| **`web/`** | Next.js 15 + TypeScript + Tailwind web platform: marketing site, Vendor Console, Corporate Portal, Admin Control Center **+ WhatsApp AI Control Center + FAMS activation dashboard** |
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
npm test                                   # 23 domain + E2E tests
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
