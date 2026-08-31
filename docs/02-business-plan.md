# 02 · Business Plan, Business Model Canvas & Revenue Model

**Deliverables:** 3 (Business Plan) · 4 (Business Model Canvas) · 5 (Revenue Model)
**Author:** CEO / Business Analyst · **Version:** 1.0

---

## 3. Business Plan

### 3.1 Company Overview

| Item | Detail |
|---|---|
| Legal name | Africa Mobility Super App Ltd (AMSA) |
| Incorporation | Nigeria (CAC), wholly-owned subsidiary structure for Phase 2/3 markets |
| HQ | Lagos, Nigeria |
| Model | Asset-light technology marketplace |
| Verticals | Transportation · Logistics & Delivery · Travel · Aviation · Marine (ready) · Security Marketplace · Corporate Services · Vendor Marketplace · Wallet & Escrow · AI Services |
| Apps | AMSA Customer, AMSA Driver, AMSA Rider, AMSA Vendor Console, AMSA Corporate, AMSA Ops |

### 3.2 Market Analysis

**TAM / SAM / SOM (annual, USD, planning estimates)**

| Layer | Definition | Estimate |
|---|---|---|
| TAM | Africa urban mobility + logistics + domestic/intl travel + executive security | $180B+ |
| SAM | Digital-addressable spend, Phase 1–2 markets (NG, GH, KE, ZA) | $28B |
| SOM (Year 3) | Realistic capture across 4 countries | $120–180M GMV |

**Market drivers**

- Urbanization: Nigeria ~53% urban by 2050; Lagos adds ~500k residents/year (UN estimates).
- Digital payments: instant payments (NIP) process billions of transactions monthly; card + transfer penetration rising.
- Diaspora remittances to Nigeria ≈ $20B/yr — diaspora-paid services (Phase 3 corridors UAE/UK/US) convert remittance flows into platform GMV.
- Corporate formalization: banks, FMCG, oil & gas, and tech companies outsource transport, courier, and executive protection — currently fragmented across brokers.
- Aviation growth: Nigerian domestic aviation carries 10M+ passengers/yr (pre-COVID trend); private aviation is underserved digitally.

**Competitive landscape**

| Competitor class | Examples | Their gap AMSA exploits |
|---|---|---|
| Ride-hailing | Bolt, Uber, inDrive, Lagride | No logistics/travel/security/aviation bundle; no escrow marketplace for premium fleet classes |
| Logistics | Kobo360, Sendbox, Gokada (evolved), Glovo | Asset-heavy or single-vertical; weak SME/corporate bundle |
| Travel OTAs | Wakanow, Travelstart, Flightfinder agents | No ground transport/security attach; weak escrow/trust for agents |
| Private aviation brokers | Offline brokers, VistaJet (global) | No self-serve marketplace, no escrow, opaque pricing |
| Security services | Word-of-mouth, guard companies | No digital marketplace, no verification chain, no SLA tracking |

**Positioning statement:** *For Nigerians and African businesses who need trusted movement and protection, AMSA is the super app that verifies every provider, protects every payment in escrow, and combines every mode of transport, delivery, and travel in one wallet — unlike single-vertical apps that force fragmentation and prepayment risk.*

### 3.3 Go-To-Market Summary (full detail in `25-gtm-strategy.md`)

Supply-first city playbook: recruit and verify vendors 4–6 weeks pre-launch, seeded demand via corporate accounts and university/campus campaigns, then consumer performance marketing on proof of ETAs.

### 3.4 Operations Plan

| Function | Model |
|---|---|
| City operations | City Manager + 2 ops agents per city (vendor onboarding, verification events, driver education) |
| Verification | Hybrid: automated BVN/NIN/CAC lookups + human review queue in AMSA Ops |
| Support | AI-first (English/Hausa/Yoruba/Igbo/Pidgin) + human agents 07:00–23:00, SOS 24/7 |
| Payments ops | Daily reconciliation across Paystack/Flutterwave/Monnify; automated payout runs T+1 |
| Trust & safety | Dedicated team: fraud review, SOS response, incident arbitration ≤ 72h |

### 3.5 Organization (detailed plan in `22-team-timeline-cost.md`)

Founding team: CEO (strategy/capital), CPTO (product/engineering), COO (city ops/vendor network), CFO/Head of Finance (payments compliance). Headcount grows 8 → 62 by Month 18.

### 3.6 Financial Plan (full detail in `23-costs-financials.md`)

- Seed: **$3.5M** for 18 months.
- Break-even at ~Month 30 (Lagos + 2 cities at scale, blended take rate ~13%).
- Year 3 targets: GMV $150M, net revenue $19M, EBITDA margin ~8%.

### 3.7 Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Regulatory friction (state ride-hail permits, CBN wallets) | High | High | Early licensing, partner-PSP wallet model, gov affairs lead, escrow via licensed partners |
| Vendor fraud / collusion | Medium | High | AI fraud scoring, escrow staged releases, device fingerprinting, vendor bonds for premium tiers |
| Cash-on-delivery leakage | Medium | Medium | Wallet-first incentives; COD capped; driver float limits |
| Incumbent price war | High | Medium | Differentiate on bundle/trust, not fares; loyalty cashback; corporate lock-in |
| FX volatility (NGN) | High | Medium | USD-linked pricing on aviation/travel; hedging; multi-currency expansion revenue |
| Security incident involving a vendor | Low | Very High | Mandatory vendor insurance/license verification, SOS protocol, incident response runbook, liability insurance |
| Platform engineering delays | Medium | High | 16-week MVP scope discipline, phased vertical launch gates |

---

## 4. Business Model Canvas

| | |
|---|---|
| **Key Partners** | Verified vendors (15 types: taxi fleets, chauffeur cos, dispatch riders, logistics/courier cos, travel agencies, tour operators, hotels, security companies, jet/helicopter operators, charter cos, boat operators, corporate service providers) · Paystack, Flutterwave, Monnify · Google Maps, OpenStreetMap · Amadeus, Sabre · Telecom/SMS/WhatsApp gateways · NIN/BVN/CAC verification APIs · Insurers · CAC, state transport authorities, NDPC |
| **Key Activities** | Marketplace liquidity ops (demand + supply) · Vendor KYC/verification · Escrow & payouts · Matching/dispatch engine · Safety & fraud ops · Corporate sales · AI model ops · City launches |
| **Key Resources** | Platform (apps + microservices) · Verified vendor network · Wallet/escrow licenses & integrations · Trust & safety team · Data & ML models · Brand |
| **Value Propositions** | **Customers:** every mobility/logistics/travel/security need in one app; verified providers; escrow protection; SOS everywhere; one wallet; 5 languages. **Vendors:** demand access, guaranteed payment (escrow), free business tools, payouts T+1, corporate deal flow. **Corporates:** controlled spend, approvals, monthly billing, analytics, compliance. **Diaspora:** book & pay for family in Nigeria from UAE/UK/US |
| **Customer Relationships** | Self-serve app + AI support + human escalation · Vendor success managers (Pro/Enterprise) · Corporate account managers · Loyalty program (Basic→Executive) |
| **Channels** | iOS/Android apps · Web · Vendor console · Corporate portal · WhatsApp/SMS fallback · Agent network (campus/community) |
| **Customer Segments** | Consumers (riders/shippers/travellers) · Corporates (SME→enterprise) · Vendors (15 types) · Drivers/riders (supply side) · Diaspora senders · Travel agents |
| **Cost Structure** | Engineering & product salaries · City ops & verification · Cloud & third-party API fees · Marketing/CAC · Payment processing fees · Compliance/legal · Support |
| **Revenue Streams** | Commissions (8–20% by vertical) · Vendor subscriptions · Corporate platform fees · Travel/aviation margins · Featured listings/ads · Float income · AI/API products (Y2+) |

---

## 5. Revenue Model

### 5.1 Commission Schedule (take rates on escrow-released booking value)

| Vertical | Service classes | Take rate | Notes |
|---|---|---|---|
| Transportation | Economy/Standard taxi | 18% | High-frequency, competitive market |
| | Premium/VIP | 15% | |
| | Executive chauffeur, Luxury, SUV | 12% | High ticket, low frequency |
| | Corporate transport | 12% + platform fee | Monthly billing |
| | Airport/hotel transfer, Intercity | 14% | |
| Logistics | Bike dispatch, parcel, document | 18% | |
| | Same-day, scheduled, multi-stop | 16% | |
| | Corporate logistics, fleet logistics | 12% | Contracted rates |
| Travel | Domestic flights | 5% + service fee (₦1,500/segment) | GDS margins |
| | International flights | 4% + service fee | |
| | Packages, travel agency marketplace | 8% | |
| Aviation | Jet/helicopter charter | 8% | Quote-based, high ticket |
| | Air ambulance | 6% | Mission-critical; priced for trust |
| Marine (Phase 2) | Boat/yacht charter, water taxi | 10% | |
| Security | All security coordination services | 12% | Includes verification overhead |

### 5.2 Vendor Subscription Plans (monthly, NGN)

| Plan | Free | Standard ₦9,500 | Professional ₦27,500 | Enterprise ₦95,000 |
|---|---|---|---|---|
| Listings | 2 | 10 | Unlimited | Unlimited + multi-branch |
| Booking volume cap | 20/mo | 500/mo | Unlimited | Unlimited |
| Commission | Standard | −1pt | −2pt | −3pt (negotiated) |
| Featured listing | — | 1 slot | 5 slots | Rotational hero |
| Analytics | Basic | Standard | Advanced + export | Advanced + API |
| Payout speed | T+1 | T+1 | Same-day | Same-day (2×/day) |
| Marketing tools | — | Promotions | Promotions + campaigns | Co-branded campaigns |
| Support | Community | Priority | Dedicated CSM | Dedicated CSM + SLA |

### 5.3 Other Streams

| Stream | Mechanics | Year-1 share |
|---|---|---|
| Corporate platform fee | ₦150k–₦2.5M/mo tiered + 12% blended take | 12% |
| Service fees (travel) | ₦1,500/domestic segment, ₦4,500/international | 8% |
| Featured listings & promoted ranking | Auction CPC in-app | 4% |
| Wallet float income | Interest via licensed partner structures only | 2% |
| Cancellation/NO-SHOW fees | Split 70/30 vendor/platform (policy-capped) | 2% |
| Loyalty funding model | 1% of booking value accrues as points; breakage funds redemptions | cost center |

### 5.4 Unit Economics (Lagos taxi trip, planning baseline)

| Metric | Value |
|---|---|
| Average order value (AOV) | ₦4,800 |
| Take rate | 18% → ₦864 gross revenue/trip |
| Payment processing (cards ~55% mix) | ₦72 avg blended |
| Referral/promo amortized | ₦60 |
| Contribution margin/trip | ₦732 (85%) |
| Customer CAC (blended) | ₦3,400 |
| Orders/customer/month | 4.2 → payback < 1 month |
| 12-month LTV (customer, blended verticals) | ₦18,900 net revenue |
| LTV:CAC | ≈ 5.5× |

### 5.5 Escrow Float Model

Customer pays → platform escrow (partner PSP/settlement account) → release on completion minus commission. Median hold: transport 20 min post-drop; logistics 2h post-delivery confirmation; travel/aviation at vendor check-in/service start; security weekly milestones for retainers. Float is held with licensed banking partners; AMSA earns negotiated credit interest where compliant — never lent.
