# Africa Mobility Super App — Documentation Index

**Version:** 1.0.0 · **Status:** Baseline for Build · **Classification:** Confidential — Internal / Investors

AMSA is a multi-vertical technology marketplace combining Transportation, Logistics & Delivery, Travel, Aviation, Marine (future-ready), a verified Security Services Marketplace, Corporate Services, a Vendor Marketplace, Wallet & Escrow, and AI Automation — launching in Nigeria, designed for Africa and global scale.

---

## Repository Layout

| Path | Contents |
|---|---|
| `docs/` | This documentation library (60 deliverables) |
| `database/` | PostgreSQL DDL (`schema.sql`), seed data, ER diagrams |
| `backend/` | NestJS microservices monorepo (auth, booking, wallet/escrow, vendors, tracking, chat, notifications, AI) |
| `web/` | Next.js 15 + TypeScript + Tailwind web platform (customer web, vendor dashboard, corporate portal, admin control center) |
| `mobile/` | Flutter apps (customer, driver, rider) — feature-first clean architecture |
| `infra/` | Local docker-compose, Kubernetes/Helm, Terraform (AWS), CI/CD pipelines |

## Deliverables Map (all 60 items)

| # | Deliverable | Document |
|---|---|---|
| 1 | Executive Summary | `01-executive-summary.md` |
| 2 | Company Vision & Mission | `01-executive-summary.md` |
| 3 | Business Plan | `02-business-plan.md` |
| 4 | Business Model Canvas | `02-business-plan.md` |
| 5 | Revenue Model | `02-business-plan.md` |
| 6 | Business Requirements Document | `03-brd.md` |
| 7 | Product Requirements Document | `04-prd.md` |
| 8 | Software Requirements Specification | `05-srs.md` |
| 9 | Functional Requirements | `05-srs.md` |
| 10 | Non-Functional Requirements | `05-srs.md` |
| 11 | User Stories | `06-user-stories-use-cases.md` |
| 12 | Use Cases | `06-user-stories-use-cases.md` |
| 13 | Process Flows | `07-process-flows.md` |
| 14 | Booking Workflows | `07-process-flows.md` |
| 15 | Escrow Workflows | `07-process-flows.md` |
| 16 | Security Workflows | `07-process-flows.md` |
| 17 | Complete System Architecture | `08-system-architecture.md` |
| 18 | Microservices Architecture | `08-system-architecture.md` |
| 19 | Event-Driven Architecture | `08-system-architecture.md` |
| 20 | Database Architecture | `09-database-architecture.md` |
| 21 | Complete PostgreSQL Schema | `database/schema.sql`, `09-database-architecture.md` |
| 22 | ER Diagrams | `database/er-diagram.md` |
| 23 | API Documentation | `10-api-documentation.md` |
| 24 | API Endpoints | `10-api-documentation.md` |
| 25 | Flutter Mobile Architecture | `11-flutter-architecture.md` |
| 26 | Next.js Web Architecture | `12-nextjs-architecture.md` |
| 27 | Customer App Wireframes | `13-wireframes-mobile.md` |
| 28 | Driver App Wireframes | `13-wireframes-mobile.md` |
| 29 | Rider App Wireframes | `13-wireframes-mobile.md` |
| 30 | Vendor Dashboard Wireframes | `14-wireframes-dashboards.md` |
| 31 | Security Dashboard Wireframes | `14-wireframes-dashboards.md` |
| 32 | Corporate Portal Wireframes | `14-wireframes-dashboards.md` |
| 33 | Admin Dashboard Wireframes | `14-wireframes-dashboards.md` |
| 34 | Design System | `15-design-system.md` |
| 35 | Color Palette | `15-design-system.md` |
| 36 | Typography System | `15-design-system.md` |
| 37 | Component Library | `15-design-system.md` |
| 38 | AWS Infrastructure Design | `16-aws-infrastructure.md` |
| 39 | Kubernetes Architecture | `16-aws-infrastructure.md` |
| 40 | CI/CD Pipeline | `16-aws-infrastructure.md` |
| 41 | Security Architecture | `17-security-architecture.md` |
| 42 | Disaster Recovery Architecture | `18-dr-backup-monitoring.md` |
| 43 | Backup Strategy | `18-dr-backup-monitoring.md` |
| 44 | Monitoring & Logging Strategy | `18-dr-backup-monitoring.md` |
| 45 | AI Architecture | `19-ai-architecture.md` |
| 46 | Machine Learning Models | `19-ai-architecture.md` |
| 47 | Testing Strategy | `20-testing-qa.md` |
| 48 | QA Strategy | `20-testing-qa.md` |
| 49 | MVP Roadmap | `21-roadmaps.md` |
| 50 | Product Roadmap | `21-roadmaps.md` |
| 51 | Scaling Strategy | `21-roadmaps.md` |
| 52 | Team Hiring Plan | `22-team-timeline-cost.md` |
| 53 | Development Timeline | `22-team-timeline-cost.md` |
| 54 | Development Cost Estimate | `22-team-timeline-cost.md` |
| 55 | Operational Cost Estimate | `23-costs-financials.md` |
| 56 | Financial Projections | `23-costs-financials.md` |
| 57 | Investor Pitch Deck | `24-investor-pitch-deck.md` |
| 58 | Go-To-Market Strategy | `25-gtm-strategy.md` |
| 59 | Vendor Acquisition Strategy | `25-gtm-strategy.md` |
| 60 | Corporate Sales Strategy | `25-gtm-strategy.md` |
| 61 | WhatsApp Smart AI Customer Service Platform | `26-whatsapp-ai-platform.md` |
| 62 | Deliverables Traceability Map (consolidated spec audit) | `27-deliverables-traceability.md` |
| 63 | FAMS — Feature Activation Management System (activation control plane, spec v2) | `28-fams.md` |

## Platform Apps & Brands

| App | Audience | Technology |
|---|---|---|
| **AMSA Customer** | Riders, shippers, travellers, security clients | Flutter (iOS/Android) + Next.js web |
| **AMSA Driver** | Taxi/chauffeur drivers | Flutter |
| **AMSA Rider** | Dispatch riders | Flutter |
| **AMSA Vendor Console** | All 15 vendor types | Next.js (responsive) |
| **AMSA Corporate** | Corporate clients | Next.js |
| **AMSA Ops (Admin)** | Support, admins, super admins | Next.js |

## Reading Order

- **Investors / Founders:** 01 → 02 → 23 → 24 → 25
- **Product / Design:** 03 → 04 → 05 → 06 → 13 → 14 → 15
- **Engineering:** 05 → 07 → 08 → 09 → 10 → 11 → 12 → 16 → 17 → 18 → 19 → 20
- **QA / PM:** 05 → 07 → 20 → 21 → 22
