# 07 · Process Flows (Booking · Escrow · Security & Operations)

**Deliverables:** 13 (Process Flows) · 14 (Booking Workflows) · 15 (Escrow Workflows) · 16 (Security Workflows)

---

## 1. Master Customer Journey

```mermaid
flowchart TD
  A[Discover AMSA] --> B[Signup + OTP]
  B --> C{Add payment?}
  C -- wallet --> D[Fund wallet: Card/Transfer/USSD]
  C -- later --> E[Browse services]
  D --> E
  E --> F[Request service\nRide/Send/Fly/Protect]
  F --> G[Matching / Quotes]
  G --> H[Confirm + Escrow Hold]
  H --> I[Service Delivery\nlive tracking]
  I --> J[Verify completion\nOTP/POD/ticket]
  J --> K[Escrow release\ncommission + tax + payout]
  K --> L[Rate + Tip + Receipt]
  L --> M[Loyalty points + cashback]
  M --> E
```

## 2. Booking Workflows

### 2.1 Instant Booking (taxi, dispatch)

```mermaid
sequenceDiagram
  autonumber
  participant C as Customer App
  participant API as API Gateway
  participant BK as Booking Service
  participant MM as Matching Engine
  participant V as Vendor/Driver App
  participant PAY as Payment Service
  C->>API: POST /bookings (instant, class, pickup/dropoff)
  API->>BK: validate coverage + fare estimate (AI pricing)
  BK->>MM: request dispatch (ranked candidates)
  MM->>V: offer #1 (15s TTL)
  alt accepted
    V-->>MM: accept (driver, asset)
    MM-->>BK: matched
    BK->>PAY: escrow hold (wallet/card pre-auth)
    PAY-->>C: payment confirm (3DS if card)
    BK-->>C: CONFIRMED + driver profile + ETA
  else cascade x5 then fail
    BK-->>C: EXPIRED + alternatives (class/schedule)
    BK->>PAY: release hold
  end
  Note over C,V: EN_ROUTE → OTP pickup verify → IN_PROGRESS → tracking → COMPLETED
  BK->>PAY: finalize fare (extras) → escrow split & release
  PAY-->>V: vendor earnings credit (payout T+1/same-day)
  PAY-->>C: receipt + rating prompt
```

**Dispatch ranking score** = `0.35·proximity + 0.25·scorecard + 0.15·class/capacity fit + 0.10·acceptance momentum + 0.08·subscription tier + 0.07·fraud/health`.

### 2.2 Quote-Based Booking (aviation, security, event transport, luxury)

```mermaid
flowchart TD
  A[Customer builds RFQ scope\npassengers/route/dates/personnel/assets] --> B[System validates + attaches risk/ops context]
  B --> C{Broadcast to qualifying vendors}
  C --> D[Vendor A quotes - validity 24h]
  C --> E[Vendor B quotes]
  C --> F[Vendor C quotes]
  D & E & F --> G[Customer compares quotes\nverified badges, price, terms]
  G --> H{Accept quote?}
  H -- yes --> I[Escrow fund 100% or milestone plan]
  I --> J[Admin sanity-check high-risk jobs\naviation/security mandatory]
  J --> K[Scheduled delivery + milestone tracking]
  K --> L[Milestone sign-offs → staged releases]
  H -- no/expire --> M[RFQ expires - re-quote or cancel]
```

### 2.3 Scheduled & Recurring

- Scheduled: pre-assignment window T-2h; vendor SLA to confirm by T-1h else re-dispatch cascade + customer alert.
- Recurring (corporate): template materializes child bookings nightly; skips holidays via policy; exceptions route to approval chain.

### 2.4 Corporate Booking with Approvals

```mermaid
flowchart LR
  A[Employee requests] --> B{Policy engine}
  B -- within policy & budget --> C[Auto-approved → dispatch]
  B -- breach class cap/budget --> D[Manager approval ≤ SLA 30m]
  D -- approved --> C
  D -- rejected --> E[Notify employee + reason]
  C --> F[Trip/shipment executes on corporate wallet]
  F --> G[Cost center tagging + monthly invoice]
```

## 3. Escrow Workflows

### 3.1 Lifecycle

```mermaid
stateDiagram-v2
  [*] --> AUTHORIZED: payment authorized/pre-auth
  AUTHORIZED --> FUNDED: captured into escrow ledger
  FUNDED --> HELD: service confirmed & started
  HELD --> RELEASED: completion verified
  HELD --> PARTIAL_RELEASED: milestones (retainers/aviation)
  PARTIAL_RELEASED --> RELEASED: final milestone
  HELD --> DISPUTE_HOLD: dispute/chargeback
  DISPUTE_HOLD --> RELEASED: vendor wins
  DISPUTE_HOLD --> REFUNDED: customer wins
  DISPUTE_HOLD --> PARTIALLY_REFUNDED: split decision
  RELEASED --> [*]
  REFUNDED --> [*]
```

### 3.2 Settlement Split (per completed booking)

```mermaid
flowchart LR
  A[Gross booking value 100%] --> B[Platform commission 8–20% by vertical]
  A --> C[VAT 7.5% NG on platform fee where applicable]
  A --> D[Vendor net payable]
  B & C --> E[Platform revenue ledger]
  D --> F{Payout preference}
  F -- default --> G[T+1 batch to bank]
  F -- Pro/Ent --> H[Same-day payout]
  F -- retain --> I[Vendor wallet balance]
  A --> J[Rewards accrual 1pt/₦100 + cashback by tier]
```

### 3.3 Money Movement Rules (normative)

| Rule | Detail |
|---|---|
| Double-entry | Every escrow/payout/refund = balanced journal (see `database/schema.sql` ledger tables) |
| Idempotency | All PSP webhooks & payout calls carry idempotency keys |
| Refund matrix | Vendor-fault: 100% + platform absorbs fee; customer-fault post-SLA: policy fee, remainder refunds; force-majeure: 100% |
| Partial refunds | Pro-rata milestones; VAT reversed proportionally |
| Chargeback | Freeze → evidence pack (GPS, chat, POD, signatures) → represent within 7d |
| Reconciliation | Hourly PSP webhook vs statement 3-way match; breaks page ops dashboard |
| Holds | New vendors: first 5 payouts manual review; fraud-scored accounts: rolling reserve ≤ 10% for 14d |

### 3.4 Dispute & Arbitration SLA

Open ≤ 48h post-completion → vendor responds 24h → agent decision 72h → arbitration final 7d. All state transitions emit events to audit + notify both parties.

## 4. Vendor Onboarding & Verification Workflow (all vendor types)

```mermaid
flowchart TD
  A[Vendor applies: business + beneficial owner info] --> B[Email + phone OTP verify]
  B --> C[Document pack upload\nCAC, TIN, licenses, insurance, IDs, bank]
  C --> D[Automated checks\nCAC lookup - TIN check - penny-drop bank - NIN/BVN owners]
  D --> E{Automated pass?}
  E -- fail --> F[Rejection with reasons / resubmit]
  E -- pass --> G[Risk score + human review queue]
  G --> H{Admin review}
  H -- reject --> F
  H -- approve with MFA --> I[ACTIVE vendor]
  I --> J[Add assets: photos, videos, docs, pricing, availability]
  J --> K[Compliance monitoring\nlicense/insurance expiry alerts T-30d]
  K -- expiry --> L[AUTO-SUSPEND + re-verification path]
```

**Security providers (mandatory 5 layers):** Identity (all personnel IDs) + Business (CAC + years operating) + License (state/security authority permits) + Insurance (liability cover verified with insurer) + Compliance (background checks personnel, no-sanctions screening). Admin approval **required**; personnel roster locked per engagement.

## 5. Security Services Delivery Workflow (post-approval)

```mermaid
sequenceDiagram
  autonumber
  participant B as Buyer (Corp)
  participant AMSA as Platform
  participant S as Security Vendor
  participant T as Trust&Safety
  B->>AMSA: RFQ (exec protection, 3 days, route, personnel)
  AMSA->>S: RFQ to verified pool (license/insurance valid)
  S-->>AMSA: Quote + roster + run sheet
  AMSA->>T: Risk sanity check (route, asset value, personnel)
  T-->>AMSA: Cleared
  AMSA-->>B: Quotes
  B->>AMSA: Accept + fund milestone escrow
  AMSA->>S: Deploy order (roster locked)
  loop daily milestones
    S->>AMSA: Deployment log + incident report (if any)
    AMSA->>B: Milestone sign-off request
    B-->>AMSA: Approve → escrow release tranche
  end
  AMSA->>S: Final payout (minus 12%)
  AMSA->>B: Mission report + analytics
```

## 6. Safety / SOS Workflow

```mermaid
flowchart TD
  A[SOS pressed ≤2 taps\nor anomaly auto-trigger] --> B[Incident created: live GPS, trip, driver, chat snapshot]
  B --> C[Response line auto-dial + ops console alert ≤ 5 min]
  B --> D[Trusted contacts SMS + live link]
  B --> E{Severity triage}
  E -- "life-threatening" --> F[Emergency services dispatch protocol\nNEMA/Police/EMS by city + vendor escalation]
  E -- "distress/concern" --> G[Ops call customer + driver on masked line\nsilent monitor trip]
  F & G --> H[Live incident channel: audio/video stream if customer enables]
  H --> I[Resolution + incident report]
  I --> J[Follow-up: refunds/compensation/legal/\nvendor/driver action + pattern analysis]
```

Anomaly triggers: route deviation >350m/90s, unscheduled stop >5min, panic shake gesture, device offline >10min mid-trip, mid-trip SOS keyword in chat.

## 7. Payment Failover Chain

```mermaid
flowchart LR
  A[Charge attempt] --> B[Paystack]
  B -- "error/timeout x2" --> C[Flutterwave]
  C -- "error/timeout x2" --> D[Monnify]
  D -- fail --> E[Decline + alternative methods\ntransfer/USSD/COD capped]
  B & C & D -- success --> F[(Ledger + receipt)]
```

## 8. City Launch Runbook (ops flow)

1. T-6wk: vendor pipeline (target: 120 cars, 60 bikes, 10 logistics cos, 5 travel agents, 3 security cos per city)
2. T-4wk: verification events (in-person doc days), coverage geofences, pricing study
3. T-2wk: driver/rider training + app install days; corporate pre-sales (10 accounts)
4. T-0: soft launch (invite codes) — liquidity checkpoints: match rate ≥ 80%, ETA p50 ≤ 8 min
5. T+2wk: public launch + performance marketing; heat-map-guided supply incentives
