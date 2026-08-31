# 22 · ER Diagrams (Core Domains)

Full DDL: `database/schema.sql`. Diagrams below are Mermaid `erDiagram` views of the core clusters.

## 1. Identity & Access

```mermaid
erDiagram
  users ||--o{ user_roles : has
  users ||--o{ sessions : authenticates
  users ||--o{ devices : registers
  users ||--o{ otp_codes : verifies
  users ||--o{ kyc_verifications : submits
  users ||--o{ consents : grants
  users ||--o{ biometric_verifications : "face-checks"
  users }o--|| countries : "resides in"
  users }o--o| cities : "based in"
  audit_logs }o--o| users : "acted by"
```

## 2. Vendor & Assets

```mermaid
erDiagram
  users ||--|| vendors : owns
  vendors ||--o{ vendor_verifications : "5-layer checks"
  vendors ||--o{ vendor_staff : employs
  vendor_staff }o--|| users : "is user"
  vendors ||--o{ vendor_subscriptions : subscribes
  subscription_plans ||--o{ vendor_subscriptions : "priced by"
  vendors ||--o{ assets : registers
  assets ||--o{ asset_documents : documents
  assets ||--o{ asset_maintenance : maintains
  assets ||--o{ asset_availability : "calendar blocks"
  vendors ||--o{ pricing_rules : configures
  service_categories ||--o{ pricing_rules : "priced for"
  security_personnel }o--|| vendors : "belongs to"
```

## 3. Booking, Matching & RFQ

```mermaid
erDiagram
  users ||--o{ bookings : places
  vendors |o--o{ bookings : fulfills
  users |o--o{ bookings : "drives/rides"
  assets |o--o{ bookings : "assigned asset"
  service_categories ||--o{ bookings : categorizes
  bookings ||--o{ booking_stops : "multi-stop"
  bookings ||--o{ booking_events : "state history"
  bookings ||--o{ offers : dispatches
  bookings |o--o{ rfqs : "originates rfq"
  rfqs ||--o{ quotes : receives
  quotes |o--o{ bookings : "awarded becomes booking"
  bookings ||--o{ reviews : reviewed
```

## 4. Money, Wallet & Escrow

```mermaid
erDiagram
  users ||--o{ wallets : holds
  vendors ||--o{ wallets : holds
  companies ||--o{ wallets : holds
  wallets ||--o{ journal_lines : "movement lines"
  ledger_accounts ||--o{ journal_lines : "posts to"
  journal_entries ||--o{ journal_lines : contains
  bookings ||--o{ journal_entries : "money source"
  bookings ||--o{ payment_intents : pays
  payment_intents ||--o{ refunds : refunds
  users ||--o{ payment_methods : saves
  bookings ||--o| escrow_holds : "protected by"
  escrow_holds ||--o{ escrow_releases : "tranche releases"
  escrow_releases }o--|| journal_entries : "posts money"
  payouts }o--|| journal_entries : "posts money"
  vendors ||--o{ payouts : receives
  disputes }o--o| escrow_holds : freezes
  disputes ||--o{ dispute_messages : discusses
  rfqs ||--o{ quotes : "milestone plans"
```

## 5. Travel & Security Ops

```mermaid
erDiagram
  bookings ||--o| flight_bookings : "travel detail"
  flight_bookings ||--o{ flight_segments : "has legs"
  flight_bookings ||--o{ flight_passengers : "has pax"
  bookings ||--o{ deployments : "security engagement"
  vendors ||--o{ deployments : staffs
  deployments ||--o{ deployment_logs : "daily logs"
  deployments ||--o{ incident_reports : "incidents"
  bookings ||--o{ incident_reports : "SOS/ incidents"
```

## 6. Comms, Corporate & Growth

```mermaid
erDiagram
  threads ||--o{ thread_participants : includes
  threads ||--o{ messages : contains
  messages }o--o| messages : "replies to"
  threads ||--o{ calls : "voice/video"
  companies ||--o{ company_employees : employs
  companies ||--o{ departments : defines
  departments ||--o{ budget_pools : "funded by"
  companies ||--o{ approval_requests : approves
  companies ||--o{ invoices : billed
  invoices ||--o{ invoice_lines : itemizes
  users ||--o| loyalty_members : "tier member"
  loyalty_members ||--o{ loyalty_ledger : "points ledger"
  promotions ||--o{ promo_redemptions : redeemed
  users ||--o{ referrals : refers
```

## 7. Booking ↔ Money Traceability (the audit spine)

```mermaid
flowchart LR
  B[bookings] --> PI[payment_intents]
  B --> EH[escrow_holds]
  B --> PI
  EH --> ER[escrow_releases]
  ER --> JE[journal_entries]
  PI --> RF[refunds]
  RF --> JE
  PO[payouts] --> JE
  JE --> JL[journal_lines]
  JL --> W[wallets]
  JL --> LA[ledger_accounts]
  AL[audit_logs] -.hash-chain.- AL
```

Every naira is traceable: booking → payment intent → escrow hold → release → journal entry → balanced lines → wallet/ledger account — with an append-only audit log hash-chained alongside.
