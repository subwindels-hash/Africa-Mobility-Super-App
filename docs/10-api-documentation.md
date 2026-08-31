# 10 · API Documentation & Endpoint Catalog

**Deliverables:** 23 (API Documentation) · 24 (API Endpoints)

---

## 1. Conventions

| Aspect | Standard |
|---|---|
| Base URL (prod) | `https://api.amsa.africa/v1` |
| Auth | `Authorization: Bearer <JWT>`; service tokens `X-Service-Token` |
| Idempotency | `Idempotency-Key` header required on money/booking POSTs (24h window) |
| Versioning | URL major (`/v1`), additive changes only within major |
| Pagination | Cursor: `?limit=20&cursor=…`; response `{data, nextCursor, totalEstimate}` |
| Errors | RFC-7807 problem+json: `{type, title, status, code, message, details, traceId}` |
| Money | `{amount: 480000, currency: "NGN"}` (minor units, integer) |
| Geo | GeoJSON points + `lat/lng` shorthand accepted |
| Time | RFC-3339 UTC; client renders in user timezone |
| Rate limits | `X-RateLimit-*` headers; 429 with `Retry-After` |
| Locale | `Accept-Language: en | ha | yo | ig | pcm` on localized resources |

### Standard error codes

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_REQUIRED` | 401 | Missing/expired token |
| `FORBIDDEN_ROLE` | 403 | RBAC denial |
| `NOT_FOUND` | 404 | Resource absent |
| `VALIDATION_FAILED` | 422 | Field errors in `details[]` |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different body |
| `ILLEGAL_STATE` | 409 | Booking/escrow transition rejected |
| `COVERAGE_UNAVAILABLE` | 422 | Pickup outside coverage |
| `PAYMENT_FAILED` | 402 | PSP decline after failover |
| `RISK_STEP_UP_REQUIRED` | 403 | Fraud step-up (MFA) required |
| `RATE_LIMITED` | 429 | Backoff and retry |

## 2. Endpoint Catalog (v1)

### Identity & Profile (`identity-service`)

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/auth/otp/request` | public | Send OTP (SMS→WhatsApp fallback) |
| POST | `/auth/otp/verify` | public | Verify OTP, issue tokens (register if new) |
| POST | `/auth/login` | public | Phone/email + password |
| POST | `/auth/refresh` | refresh token | Rotate refresh, new access |
| POST | `/auth/logout` | any | Revoke session |
| POST | `/auth/mfa/totp/enroll` | user | Begin TOTP enrollment (QR) |
| POST | `/auth/mfa/totp/verify` | user | Confirm TOTP code |
| POST | `/auth/mfa/challenge` | user | Step-up verification (money actions) |
| GET | `/me` | user | Profile + roles + tier + kyc level |
| PATCH | `/me` | user | Update profile/locale/currency |
| GET | `/me/sessions` · DELETE `/me/sessions/{id}` | user | Device sessions & revoke |
| POST | `/me/kyc` | user | Submit KYC doc/kind |
| GET | `/me/kyc` | user | Verification statuses |
| POST | `/me/consents` | user | Record consent (NDPR) |
| GET | `/me/export` | user | GDPR/NDPR data export |
| DELETE | `/me` | user | Account closure (erasure pipeline) |

### Geo & Catalog

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/countries` / `/countries/{code}` | public | Countries + config (currency/tax/PSP) |
| GET | `/cities?country=NG&active=true` | public | Cities |
| GET | `/categories?vertical=transportation` | public | Service catalog tree |
| GET | `/coverage/check?lat=..&lng=..` | public | Coverage + available categories |
| GET | `/places/me` · POST `/places/me` | user | Saved places |
| GET | `/places/search?q=..` | user | Place autocomplete (Google→OSM) |

### Vendors & Assets (`vendor-service`, `asset-service`)

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/vendors/register` | user | Start vendor onboarding |
| POST | `/vendors/{id}/verifications` | vendor | Upload verification layer doc |
| POST | `/vendors/{id}/verifications/{layer}/submit` | vendor | Submit layer for review |
| GET | `/vendors/{id}` | public | Public profile (badges, rating, assets) |
| GET | `/vendors?vertical=&city=&featured=&q=` | public | Marketplace search |
| PATCH | `/vendors/{id}` | vendor | Update profile |
| POST | `/vendors/{id}/staff/invite` | vendor | Invite driver/rider/manager |
| GET | `/vendors/{id}/scorecard` | vendor | Performance metrics |
| GET | `/vendors/{id}/subscriptions` · POST `/vendors/{id}/subscriptions` | vendor | Plan management |
| POST | `/assets` | vendor | Register asset |
| PATCH | `/assets/{id}` · DELETE `/assets/{id}` | vendor | Manage asset |
| POST | `/assets/{id}/documents` | vendor | Docs (license, insurance…) |
| POST | `/assets/{id}/maintenance` | vendor | Maintenance record |
| GET/PUT | `/assets/{id}/availability` | vendor | Calendar blocks |
| POST | `/pricing-rules` | vendor | Custom pricing (within caps) |

### Bookings, Matching, RFQ (`booking-service`, `matching-service`, `pricing-service`)

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/bookings/estimate` | user | AI fare range + ETA pre-booking |
| POST | `/bookings` | user | Create (instant/scheduled) — triggers dispatch |
| GET | `/bookings?status=&cursor=` | user | List own bookings |
| GET | `/bookings/{id}` | party | Booking detail (state, stops, price freeze) |
| POST | `/bookings/{id}/cancel` | party | Cancel w/ policy evaluation |
| POST | `/bookings/{id}/stops` | customer | Add stop (≤3 rides / ≤8 logistics) |
| POST | `/bookings/{id}/rate` | customer | Review + tip |
| POST | `/bookings/{id}/dispute` | customer | Open dispute |
| GET | `/bookings/{id}/receipt` | party | PDF receipt |
| POST | `/bookings/{id}/share` | customer | Generate live-share link |
| — | *Driver/Rider:* | | |
| GET | `/dispatch/offers` | driver/rider | Pending offers (also socket `offer:new`) |
| POST | `/offers/{id}/accept` · `/reject` | driver/rider | Respond to offer |
| POST | `/bookings/{id}/arrived` | driver/rider | Arrived at pickup |
| POST | `/bookings/{id}/start` | driver/rider | Verify OTP/face → IN_PROGRESS |
| POST | `/bookings/{id}/complete` | driver/rider | Complete + POD |
| POST | `/bookings/{id}/position` | driver/rider | GPS ping (batch ok; prefer socket) |
| — | *RFQ/quotes:* | | |
| POST | `/rfqs` | user/corp | Create quote request |
| GET | `/rfqs/{id}/quotes` | owner | Compare quotes |
| POST | `/rfqs/{id}/quotes` | vendor | Submit quote + milestones |
| POST | `/quotes/{id}/accept` | owner | Accept → escrow funding |
| POST | `/quotes/{id}/reject` | owner | Reject with reason |

### Wallet, Payments, Escrow (`payment-service`, `wallet-ledger`, `escrow-service`)

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/wallets/me` | user | Balances (available/pending) per currency |
| POST | `/wallets/fund` | user | Fund via card/transfer/USSD (PSP chain) |
| POST | `/wallets/transfer` | user | P2P wallet transfer |
| POST | `/wallets/withdraw` | user | Withdraw to bank (MFA) |
| GET | `/wallets/statements?from=&to=&format=csv` | user | Statements |
| GET | `/payment-methods` · POST · DELETE `/{id}` | user | Methods (tokenized only) |
| GET | `/escrow/{bookingId}` | party | Escrow state + timeline |
| POST | `/escrow/{bookingId}/milestones/{m}/approve` | payer | Milestone sign-off |
| GET | `/payouts` · GET `/payouts/{id}` | vendor/driver/rider | Payout history |
| POST | `/disputes/{id}/messages` | party | Dispute evidence message |
| POST | `/admin/disputes/{id}/resolve` | admin | Resolve (refund/split/release) |
| POST | `/webhooks/paystack` · `/flutterwave` · `/monnify` | PSP (signed) | Idempotent money webhooks |

### Travel (`travel-service`)

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/flights/search` | user | One-way/return/multi-city (Amadeus→Sabre failover) |
| POST | `/flights/price` | user | Confirm price (hold) |
| POST | `/flights/bookings` | user | Book + escrow fund |
| POST | `/flights/bookings/{id}/passengers` | user | Passenger details (API/APIS) |
| GET | `/flights/bookings/{id}` | party | PNR/tickets status |
| POST | `/flights/bookings/{id}/cancel` | user | Fare-rule cancellation |

### Security Marketplace (`security-ops-service`)

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/security/services` | public | Catalog + verified providers |
| POST | `/security/rfqs` | user/corp | Protection/escort/convoy RFQ (scope builder) |
| GET | `/security/rfqs/{id}` | party | RFQ + quotes + vendor badges |
| POST | `/security/deployments/{id}/logs` | vendor | Daily deployment log |
| POST | `/security/deployments/{id}/milestones/{m}/signoff` | client | Milestone approval |
| POST | `/security/incidents` | any | Incident report (links SOS) |

### Communication (`communication-service`)

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/threads` · GET `/threads/{id}/messages` | user | Chat threads/history |
| POST | `/threads/{id}/messages` | user | Send (text/file/location) |
| POST | `/threads/{id}/translate` | user | Translate thread messages |
| POST | `/calls` | user | Initiate voice/video/masked call |
| POST | `/calls/{id}/signal` | user | WebRTC signaling (or via socket) |
| POST | `/calls/{id}/end` | user | End + summary trigger |
| GET | `/transcriptions/{messageId}` | user | Voice-note transcription |

### Safety

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/sos` | user | Trigger SOS (returns protocol state) |
| GET | `/sos/{incidentId}` | user/ops | Incident timeline |
| POST | `/sos/{incidentId}/resolve` | ops | Resolve incident |
| GET/PUT | `/me/trusted-contacts` | user | Trusted contacts config |

### Corporate (`corporate-service`)

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/corporate/companies` | corp admin | Register company |
| GET/PATCH | `/corporate/companies/{id}` | corp admin | Manage |
| POST | `/corporate/companies/{id}/employees` · PATCH `/{empId}` | corp admin | Employees & roles |
| CRUD | `/corporate/departments` | corp admin | Departments |
| CRUD | `/corporate/budgets` | corp finance | Budget pools & policies |
| GET | `/corporate/approvals?status=pending` · POST `/{id}/decide` | approver | Approval inbox |
| GET | `/corporate/invoices` · GET `/{id}/pdf` | finance | Monthly invoices |
| GET | `/corporate/analytics?group_by=dept\|employee\|category` | finance | Spend analytics |

### Loyalty, Promotions, Admin, Analytics

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/loyalty/me` · POST `/loyalty/redeem` | user | Tier, points, redeem |
| GET | `/promotions?code=` · POST `/bookings/{id}/promo` | user | Validate/apply promo |
| POST | `/referrals/claim` | user | Bind referral code |
| GET | `/admin/queues/kyc` · POST `/admin/kyc/{id}/decision` | admin | Review queues |
| GET | `/admin/vendors?status=in_review` · POST `/{id}/activate` | admin | Vendor approvals (MFA) |
| GET | `/admin/fraud/cases` · POST `/{id}/action` | analyst | Fraud console |
| CRUD | `/admin/promotions` · `/admin/flags` · `/admin/cms` | admin | Growth/platform config |
| GET | `/admin/analytics/dashboard?city=&from=&to=&vertical=` | admin | KPI dashboards |
| GET | `/admin/audit-logs?entity=&actor=` | admin | Audit search |
| GET | `/analytics/vendor/me` · `/analytics/driver/me` | vendor/driver | Self analytics |

## 3. Sample: Create Instant Booking

**Request**
```http
POST /v1/bookings HTTP/1.1
Authorization: Bearer eyJhbGciOi...
Idempotency-Key: 7d1f...c93
Content-Type: application/json

{
  "type": "instant",
  "categoryCode": "ride.premium",
  "pickup": {"lat": 6.4281, "lng": 3.4219, "label": "Victoria Island"},
  "dropoff": {"lat": 6.5244, "lng": 3.3792, "label": "Ikeja City Mall"},
  "paymentMethod": "wallet",
  "promoCode": null,
  "scheduledAt": null,
  "stops": [],
  "meta": {"passengers": 2}
}
```

**201 Response**
```json
{
  "id": "bkg_01J8ZK3P9Q",
  "status": "requested",
  "vertical": "transportation",
  "priceEstimate": {"min": 14500000, "max": 17200000, "currency": "NGN", "confidence": 0.86, "surge": 1.2},
  "etaPickupSec": 240,
  "escrow": null,
  "traceId": "b7ad...e21"
}
```

## 4. WebSocket API (Socket.IO)

**Connect:** `wss://realtime.amsa.africa/socket.io/?token=<JWT>` — rooms auto-joined by role.

| Direction | Event | Payload (abbrev) | Audience |
|---|---|---|---|
| srv→cli | `booking:state` | `{bookingId, status, at, actor}` | parties |
| srv→drv | `offer:new` | `{offerId, bookingId, fare, distanceM, pickupLabel, expiresAt}` | driver/rider |
| cli→srv | `offer:respond` | `{offerId, accept}` | — |
| srv→cli | `driver:position` | `{bookingId, lat,lng, heading, etaSec}` (2–5s) | customer |
| cli→srv | `location:update` | `{lat,lng,accuracy,heading}` | — |
| srv→cli | `chat:message` · `chat:typing` · `chat:read` | thread events | participants |
| cli→srv | `chat:send` · `call:signal` | — | — |
| srv→ops | `sos:alert` · `safety:anomaly` | incident bundle | ops room |

## 5. Webhook Contracts (PSP)

`POST /webhooks/paystack` — verify `x-paystack-signature` HMAC → dedupe `data.id` → idempotent state machine: `charge.succeeded` → `payment_intents.captured` + journal; `transfer.*` → payout state; `refund.*` → refund state. All raw bodies persisted (`money.psp_webhooks`) with replay tooling.
