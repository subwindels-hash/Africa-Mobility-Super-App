# 18 · Disaster Recovery · Backup · Monitoring & Logging

**Deliverables:** 42 (DR) · 43 (Backup) · 44 (Monitoring & Logging)

---

## 42 · Disaster Recovery Architecture

| Tier | Systems | RPO | RTO | Strategy |
|---|---|---|---|---|
| **Tier 0 — Money** | PostgreSQL (money schema), escrow/wallet services, PSP integrations | ≤ 5 min | ≤ 60 min | Multi-AZ sync standby + PITR + cross-region snapshot copy; wallet svc can run in degraded single-AZ while standby promotes |
| **Tier 1 — Core** | booking, matching, auth | ≤ 5 min | ≤ 90 min | Multi-AZ; restore order right after money |
| **Tier 2 — Important** | chat history, tracking, vendor, corporate | ≤ 15 min | ≤ 4 h | Restore from backups; realtime features degraded first |
| **Tier 3 — Deferrable** | analytics marts, CMS, reports | ≤ 24 h | ≤ 24 h | Rebuild from event stream (Kafka 30-day retention) |

**DR topology:** primary region `af-south-1`; DR region `eu-west-1` with nightly cross-region snapshots + Terraform-coded rebuild (RTO for full region loss ≤ 8 h for Tier 0/1). S3 cross-region replication for media/audit (WORM preserved).

**Runbooks:** DB failover (auto + manual), region evacuation, Kafka rebuild from log, PSP outage mode (queue + manual capture), EKS node-group loss, CDN/WAF bypass, restore drill script.

**Drills:** quarterly table-top; semi-annual full Tier-0 restore in DR region with reconciliation diff (every ledger row must balance post-restore).

## 43 · Backup Strategy

| Asset | Method | Frequency | Retention | Encrypted |
|---|---|---|---|---|
| PostgreSQL | Automated snapshots + PITR WAL | 5-min WAL | 35 days PITR, 12 monthly, 7 yearly | CMK |
| PostgreSQL | Cross-region manual snapshot | daily | 30 days | CMK |
| Timescale positions | ts_dump + S3 Parquet tiering | daily | 30 days | SSE-KMS |
| Kafka (money topics) | MirrorMakerCore → DR (Phase 2) / snapshot | continuous | 30 days | TLS+CMK |
| Redis | No backup by design (cache/rebuild); BullMQ durable jobs mirrored to PG | — | — | — |
| S3 media/docs | Versioning + replication + Object-Lock audit | n/a | versions 90d; audit WORM 7y | SSE-KMS |
| Secrets | Secrets Manager (managed) + break-glass offline envelope | rotation 90d | — | KMS |
| Config/IaC | Git (source of truth) + state S3+DynamoDB lock | per commit | forever | — |

**Restore validation:** automated weekly job restores latest snapshot into scratch, runs `ledger-balance-check` + row-count assertions, posts result to ops channel. Failure = S2 incident.

## 44 · Monitoring & Logging Strategy

### Observability stack

- **Metrics:** Prometheus + Grafana (dashboards-as-code), Alertmanager → PagerDuty/Slack.
- **Logs:** structured JSON → Fluent Bit → Loki (hot 30d) → S3 (cold 1y); PII-redaction at emitter.
- **Traces:** OpenTelemetry SDK all services → Tempo/Jaeger; trace_id in every error + Kafka header.
- **RUM/APM:** Sentry (web+mobile) + Firebase Performance; Core Web Vitals + app cold-start tracked.
- **Synthetics:** 1-min probes: login, estimate→booking staging E2E, wallet balance, PSP sandbox charge.

### Golden signals & SLOs

| Service | SLO | Error budget policy |
|---|---|---|
| API gateway | 99.95% availability; p95 < 250 ms | burn-rate alerting (2%/1h fast, 5%/6h slow) |
| booking-service | 99.9%; match p95 < 3 s | on breach: freeze deploys, reliability sprint |
| payment/escrow | 99.95%; webhook lag p95 < 30 s | S1 page |
| realtime (sockets) | 99.9%; reconnect < 5 s | degrade to push+poll |
| mobile crash-free | ≥ 99.7% sessions | halt rollout |

### Key dashboards & alerts

| Dashboard | Panels (excerpt) |
|---|---|
| **Business live** | GMV, bookings/min, live trips, match-rate, cancel-rate, SOS count |
| **Money health** | escrow float, release lag, payout queue, PSP success % by provider, reconciliation breaks |
| **Infra** | pod restarts, HPA pressure, DB connections/replication lag, Redis memory, Kafka lag |
| **Safety** | open incidents, anomaly alerts, response-time-to-first-touch |
| **Fraud** | alerts by rule/model, blocked value, device clusters |

Alert routing: S1 → page on-call + leadership Slack; S2 → on-call; S3 → ticket; maintenance windows in statuspage. Statuspage (`status.amsa.africa`) auto-updates on S1/S2.
