# 09 · Database Architecture

**Deliverables:** 20 (Database Architecture) · 21 (Complete PostgreSQL Schema → `database/schema.sql`) · 22 (ER Diagrams → `database/er-diagram.md`)

---

## 1. Principles

1. **PostgreSQL 16** as the system of record; **database-per-service** as *logical schemas* on one RDS cluster at seed stage (cost-efficient), physically split by load at scale.
2. **Money is integer minor units + ISO currency** — never floats. All balances derived from immutable double-entry journal entries.
3. **Append-only where it matters** — ledger, audit, booking_events, escrow transitions are insert-only (updated via new rows).
4. **Time-series offloading** — GPS trajectory → TimescaleDB hypertable; hot position → Redis.
5. **Multi-tenancy columns** (`country_code`, `city_code`, `currency`) on every domain table from day one.
6. **Soft-delete** (`deleted_at`) for recoverable entities; hard delete only via GDPR/NDPR erasure job on PII tables with ledger-preserving anonymization.
7. **UUID v7 primary keys** (time-ordered) generated via `gen_random_uuid()`-style helpers; external IDs prefixed (`usr_`, `bkg_`).

## 2. Domain Schemas & Ownership

| Schema | Service | Core tables |
|---|---|---|
| `identity` | identity/profile | users, sessions, devices, otp_codes, kyc_verifications, consents, audit_logs |
| `geo` | geo/config | countries, cities, coverage_zones, places |
| `vendor` | vendor/asset | vendors, vendor_verifications, vendor_documents, vendor_staff, subscription_plans, vendor_subscriptions, assets, asset_documents, asset_maintenance, asset_pricing, pricing_rules |
| `booking` | booking/matching/pricing | service_categories, bookings, booking_stops, booking_events, rfqs, quotes, offers |
| `money` | payment/wallet/escrow | wallets, ledger_accounts, journal_entries, journal_lines, payment_intents, payment_methods, escrow_holds, escrow_releases, payouts, refunds, disputes, dispute_messages, fx_rates |
| `travel` | travel-service | flight_bookings, flight_passengers, flight_segments |
| `secops` | security-ops | security_personnel, deployments, deployment_logs, incident_reports |
| `comms` | communication | threads, thread_participants, messages, message_attachments, calls |
| `telemetry` | tracking | positions (hypertable), geofence_events |
| `corporate` | corporate-service | companies, departments, company_employees, budget_pools, approval_requests, invoices, invoice_lines |
| `growth` | loyalty/promos | loyalty_members, loyalty_ledger, promotions, promo_codes, promo_redemptions, referrals |
| `platform` | admin/CMS | feature_flags, cms_content, fraud_cases, review_queue, reviews, notifications, notification_templates |

Full DDL: **`database/schema.sql`** (runs top-to-bottom; idempotent guards). Seed data: `database/seed.sql` (countries, 10 cities, 15 vendor types, service categories, subscription plans, loyalty tiers, admin roles).

## 3. Key Design Decisions

| Area | Decision | Rationale |
|---|---|---|
| Booking state | `bookings.status` + `booking_events` append-log | Enforce transitions in service; DB keeps history |
| Money | `journal_entries` + `journal_lines` (debit/credit, must net zero — enforced by trigger) | Auditable escrow/payout/refunds; balances = SUM(journal_lines) cache + periodic reconciliation job |
| Escrow | `escrow_holds` with state machine + `escrow_releases` rows per tranche | Partial/milestone releases first-class |
| Fare snapshot | `bookings.price_quote` JSONB frozen at confirm | Disputes resolved against frozen quote, not live prices |
| GPS | hypertable `positions` (booking_id, ts, geom) partitioned auto | 10M+ events/day; compression after 7d |
| Search | OpenSearch for vendor catalog/chat; PG for transactional truth | Avoid PG bloat |
| IDs | UUID PK + `public_id` text unique (prefixed) | Opaque external refs |
| Enums | PG ENUM types with `-- enum:` markers | Type safety; migration scripts provided for adds |
| Audit | `audit_logs` in dedicated schema, hash-chained (`prev_hash`) | Tamper-evidence for money/admin actions |
| Soft-deletes | `deleted_at TIMESTAMPTZ` | NDPR erasure job anonymizes PII columns |

## 4. Scaling Plan

| Stage | Trigger | Action |
|---|---|---|
| S0 (0–100k users) | launch | Single RDS multi-AZ db.r6g.xlarge; PgBouncer; read replica for analytics |
| S1 (100k–1M) | CPU > 60% sustained | Dedicated clusters for `money` + `booking`; analytics → replica → Redshift/ClickHouse marts |
| S2 (multi-country) | Phase 2 | Region-scoped clusters (read-local, money-central) or Aurora Global with write-forwarding for money |
| S3 (10M+ events/day) | telemetry growth | Timescale multi-node / tiered storage to S3 (Parquet) |

**Indexing strategy:** every FK indexed; composite `(city_code, status, created_at)` on bookings for ops queues; partial indexes on open states (`WHERE status IN ('REQUESTED','MATCHED',...)`); GiST on coverage polygons & route lines; BRIN on `positions.ts`.

**Partitioning:** `positions` (time, 1-day chunks, 7d compress); `journal_lines`/`audit_logs`/`booking_events` monthly range partitions after Y1 (template included as comments).

## 5. Data Lifecycle & Compliance

| Data | Hot | Cold | Purge |
|---|---|---|---|
| Bookings/receipts | 13 mo | archive 7y (tax) | anonymize after 7y |
| Ledger/payouts | 24 mo | 10y immutable archive | never (law) |
| GPS trajectory | 180d raw | aggregates forever | delete raw |
| Chat media (S3) | 24 mo lifecycle | — | delete on account closure + retention |
| KYC docs | while active + 5y | encrypted archive | erasure with legal holds |
| Audit logs | 1y hot | 7y WORM (S3 object-lock) | never |

## 6. Migration & Change Management

- Forward-only migrations via **Prisma Migrate / node-pg-migrate**, versioned in `backend/migrations`, gated in CI (no destructive step without dual-write plan).
- Every migration has `up` tested against prod-shaped synthetic data; `down` documented for emergencies only.
- Quarterly restore drills (see `18-dr-backup-monitoring.md`).
