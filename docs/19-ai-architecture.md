# 19 · AI Architecture & Machine Learning Models

**Deliverables:** 45 (AI Architecture) · 46 (ML Models)

---

## 45 · AI Architecture

```mermaid
flowchart TB
  subgraph Sources
    K[Kafka events: bookings, telemetry, money, engagement]
    DB[(OLTP: Postgres)]
    APP[App context: request-time features]
  end
  subgraph Platform["AI Platform (AWS)"]
    FE[Feature Store (SageMaker Feast-compatible + Redis online)]
    PIPE[Training pipelines: SageMaker Processing / Airflow]
    REG[Model Registry: versions, approvals, rollback]
    EP[Endpoints: SageMaker realtime (fraud/pricing) + batch (forecast) + Lambda for LLM routing]
    MON[Model monitoring: drift, bias, latency, business KPIs]
  end
  subgraph Consumption
    SVC[ai-service (NestJS): unified /predict API + guardrails]
    LLM[LLM layer: support assistant, translation, summaries — Bedrock/OpenAI-class with PII redaction]
  end
  Sources --> FE & PIPE --> REG --> EP --> SVC
  SVC --> LLM
  SVC -->|inline ≤150ms| booking/matching/payments
  EP --> MON
```

**Principles:** models are **advisory to deterministic engines** (pricing model proposes, rules engine enforces caps/floors and logs rationale); every AI decision logged with `model_version` + inputs hash for audit/disputes; LLM outputs pass guardrails (no medical/legal/security advice beyond scripts; no promise of refunds); human-in-the-loop for fraud blocks > threshold.

## 46 · Machine Learning Models

| # | Model | Type | Features (key) | Target metric | Serving | Guardrails |
|---|---|---|---|---|---|---|
| 1 | **Fare prediction** | GBM (LightGBM) | route dist/time (OSRM), class, city, hour, traffic index, demand, promo | MAPE ≤ 12% p50 | realtime 50ms | ±band display; clamp to pricing rules |
| 2 | **ETA prediction** | GBM + traffic embedding | live traffic, driver route, stop complexity | MAE ≤ 3 min @ 30-min horizon | realtime, cached 30s | never show impossible ETAs (route-time floor) |
| 3 | **Route optimization (multi-stop)** | Haversick+OSRM matrix → OR-tools VRP | distance/time matrix, time windows, capacity | ≥ 15% distance saved vs input order | realtime 200ms ≤ 8 stops | fallback: nearest-neighbor |
| 4 | **Vendor matching rank** | Learning-to-rank (XGBoost) | distance, scorecard, tier, acceptance momentum, capacity, fraud health | accept-rate ↑, match p95 ↓ | realtime 30ms | fairness: new-vendor exploration quota |
| 5 | **Fraud detection** | Gradient boosting + rules hybrid | device clusters, velocity, payment history, GPS consistency, account age | recall ≥ 90% @ 2% FPR on held-out; precision ≥ 60% | realtime ≤ 150ms | step-up before block; analyst review queue; adversarial monitoring |
| 6 | **Dynamic pricing (surge)** | Elasticity model + queueing balance | supply/demand ratio per geo-cell/15-min, weather, events | driver utilization ↑, rider churn neutral | realtime + shadow 2wk before enable | cap 2.0×, floor 0.85×, transparency badge, city off-switch |
| 7 | **Demand forecasting** | Temporal CNN / Prophet+XGB hybrid | historical bookings, weather, events, holidays, promos | MAPE ≤ 25% @ 1h; ≤ 35% @ 24h | batch 15-min | drives positioning incentives only |
| 8 | **AI support assistant** | RAG LLM | knowledge base (FAQs, policies), booking context, order tools | containment ≥ 60% M12, CSAT ≥ 4.3 | LLM w/ tools | PII redaction; refusal paths; human handoff w/ summary |
| 9 | **Voice-to-text** | Whisper-class ASR | 5 languages incl. code-switched Pidgin | WER ≤ 18% | async 3s | consent prompt; never auto-run on private calls |
| 10 | **Translation** | NMT (fine-tuned African models e.g. AfroMT-class) | chat/domain glossary | BLEU/adequacy QA; human eval quarterly | realtime | per-thread opt-in; never for contracts (legal disclaimer) |
| 11 | **Call summaries** | LLM over transcript | call transcript + booking | factuality spot-check ≥ 95% | post-call | stored to thread; consent banner on recorded calls |

**MLOps:** CI for models (data validation → train → eval vs champion → registry approval) · champion/challenger deployment · drift monitors (PSI > 0.2 → retrain alert) · feature parity tests online/offline · training data versioned in S3 with lineage · quarterly bias audit (pricing/fraud across user segments).
