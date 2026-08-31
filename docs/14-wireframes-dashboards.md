# 14 · Dashboard Wireframes — Vendor · Security · Corporate · Admin

**Deliverables:** 30 (Vendor) · 31 (Security) · 32 (Corporate) · 33 (Admin)
Web (Next.js), responsive 1440 → 768. Left rail nav · top bar with search + alerts + MFA badge.

---

## 30 · VENDOR DASHBOARD (all 15 vendor types; example: fleet + logistics)

### V-01 Home / Live Overview
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ AMSA Vendor Console        🔍 search…            🔔 5   👤 Chidi Motors  MFA●│
├───────────┬───────────────────────────────────────────────────────────────────┤
│ ▤ Home    │  Today · Lagos                          [Range▾] [Export CSV]      │
│ 🚚 Requests│ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐                 │
│ 🚗 Fleet  │ │ Requests ││ Active   ││ Revenue  ││ Rating   │                 │
│ 👥 Staff  │ │    38    ││    12    ││ ₦412k   ││ ★ 4.86   │                 │
│ ₵ Pricing │ │  +12% ▲ ││  4 rides ││ +8% ▲   ││ top 10%  │                 │
│ 📅 Avail. │ └──────────┘└──────────┘└──────────┘└──────────┘                 │
│ 💰 Earnings│ ── Live request queue ────────────  ── Coverage map ──────────   │
│ ⭐ Plan    │ ┌────────────────────────────────┐ ┌──────────────────────────┐ │
│ 🛡 Docs    │ │⚡ RIDE  VI→Ikeja   ₦15.5k  [Accept]│ │ ▓▓ heatmap of demand ▓▓▓ │ │
│ 📊 Stats  │ │⚡ SEND  Yaba→VI    ₦3.2k  [Accept]│ │ ▓▓ + your 14 assets ▓▓▓ │ │
│ 💬 Chats  │ │🕐 SCHED Airport 4am ₦38k  [Assign]│ └──────────────────────────┘ │
│           │ │📄 RFQ   Event 200 pax → [Quote]   │  Fleet status ●12 🟢 1 🟡 1🔧 │
│           │ └────────────────────────────────┘                                │
└───────────┴───────────────────────────────────────────────────────────────────┘
```

### V-02 Fleet / Assets · V-03 RFQ Quotes
```
┌───────────────────────────────┐  ┌───────────────────────────────┐
│ Fleet & Assets  [+ Add asset] │  │ RFQ — Event transport 200 pax │
│ ▸ Camry · ABC-123 · 🟢 ·4.9★ │  │ Client: ZenithEvents (corp)   │
│   📄 docs ✓ · 🛡 ins ✓ 12/26 │  │ Route: Eko Hotel→Landmark     │
│ ▸ Sienna · LAG-88 · 🟢 ·4.8★ │  │ Fleet needed: 4 × SUV         │
│ ▸ Bike · KJA-21 · 🟡 docs⚠   │  │ Budget hint: ₦800k–1.2M       │
│ [+ Bulk import CSV]          │  │ Your quote: ₦980,000 [Submit] │
└───────────────────────────────┘  │ Milestones: 50% / 30% / 20%  │
                                   └───────────────────────────────┘
```

### V-04 Earnings & Payouts
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Earnings            Plan: Professional → payouts same-day ✓                    │
│ Balance ₦1,284,500   Pending escrow ₦220,000   This month ₦8.4M (−12% comm)   │
│ ── Payout schedule ──────────────────────────────────────────────────────────  │
│ 31 Aug ₦980,000 → GTB •8842  ✓ paid    | 30 Aug ₦412,000 ✓    | [⚡ Payout now]│
│ ── Statements ── [Sep PDF] [CSV] [Tax invoice (VAT 7.5%)]                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 31 · SECURITY PROVIDER DASHBOARD (security-ops)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ AMSA Security Ops          🔍            🔔 2 alerts   👤 SafeGuard NG  MFA●   │
├───────────┬───────────────────────────────────────────────────────────────────┤
│ ▤ Ops     │ ── Active deployments ──────────────────────────────────────────  │
│ 🎯 RFQs   │ ┌─────────────────────────────────────────────────────────────┐   │
│ 🗓 Deploy  │ │ DEP-101 · Exec protection · Lekki→VI · LIVE 🟢              │   │
│ 👥 Roster │ │ Roster: Tunde(lead✓) · Musa✓ · vehicle KJA-90 ✓            │   │
│ 🚨 Incid. │ │ Milestone 2/3 · escrow released ₦510,000 ✓                   │   │
│ 📋 Logs   │ │ [Daily log +] [Incident +] [Client signoff]                  │   │
│ 🛡 Verify │ └─────────────────────────────────────────────────────────────┘   │
│ 📊 Stats  │ ── Personnel verification ──────────────────────────────────────  │
│           │ Name      License     Background   Status                        │
│           │ Tunde O.  ✓ 03/2027   ✓ 01/2027   🟢 deployable                  │
│           │ Musa B.   ⚠ 11/2026   ✓           🟡 renew <30d                 │
│           │ ── Compliance ── Company license ✓ 12/2027 · Insurance ✓ ₦50M   │
└───────────┴───────────────────────────────────────────────────────────────────┘
```

## 32 · CORPORATE PORTAL

### CP-01 Overview · CP-02 Approvals
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ AMSA Corporate — Zenith Bank PLC          🔍   🔔   👤 Bisi (Ops Mgr)  MFA●   │
├───────────┬───────────────────────────────────────────────────────────────────┤
│ ▤ Overview│ Sep spend ₦42.8M / ₦60M budget ███████░░░░ 71%  [+15% MoM ▲]     │
│ 📅 Book   │ ┌─────────────┐┌─────────────┐┌─────────────┐┌─────────────┐      │
│ ✅ Approve│ │ Transport   ││ Logistics   ││ Security    ││ Travel      │      │
│ 👥 Staff  │ │ ₦18.2M      ││ ₦9.4M       ││ ₦8.1M       ││ ₦7.1M       │      │
│ 🏢 Depts  │ │ 1,204 trips ││ 3,180 sends ││ 14 ops      ││ 96 tickets  │      │
│ ₵ Budgets │ └─────────────┘└─────────────┘└─────────────┘└─────────────┘      │
│ 🧾 Invoices│ ── Spend by department (bar) ── ── Policy compliance: 97% ✓ ──   │
│ 📊 Analyze│                                                                  │
└───────────┴───────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────────────┐
│ Approval inbox (3 pending)                         SLA: 30 min · policy hint  │
│ ▸ ✈️ Intl flight — Chidi (Trading) £1,240 — exceeds class cap £800  [✓][✕]   │
│ ▸ 🛡 Executive transport — VIP visitor protocol — needs director sign-off     │
│ ▸ 🚗 Weekend fleet 12 cars — over dept budget by ₦180k                        │
└───────────────────────────────────────────────────────────────────────────────┘
```

### CP-03 Budgets & Policy
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Budget pools · October                                     [+ New budget]    │
│ Trading      ₦20M ████████░░ 82%  alert @80% ⚠   policy: class≤Premium      │
│ Operations   ₦15M █████░░░░░ 48%                   curfew: none             │
│ Executive    ₦25M ██████░░░░ 61%  policy: vendors allowlist(3) SUV+         │
│ ── Invoice INV-2026-09 · PDF · CSV export · VAT breakdown · WHT fields ──    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 33 · ADMIN CONTROL CENTER

### A-01 Command Overview
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ AMSA Admin · NG-all cities   🔍  🟢3 🟡1  👤 SuperAdmin  MFA●  🎙 audit-mode │
├────────────┬──────────────────────────────────────────────────────────────────┤
│ ▤ Overview │ GMV today ₦182M (+9%) · Bookings 41,203 · Live trips 3,412 🟢   │
│ 🕵 KYC queue│ ┌────────┐┌────────┐┌─────────┐┌──────────┐┌────────────────┐   │
│ 🏢 Vendors │ │ Match  ││ Cancel ││ Fraud   ││ SOS      ││ Escrow float   │   │
│ 👤 Users   │ │ 58s p95││ 6.2%   ││ 0.31% ✓ ││ 0 open ⚠││ ₦412M held     │   │
│ 🚗 Trips   │ └────────┘└────────┘└─────────┘└──────────┘└────────────────┘   │
│ 💰 Payments│ ── GMV by vertical (stacked $) ── ── Cities table ───────────    │
│ 🔒 Escrow  │ █████ Transport 58% ███████ Logistics 27% █ Travel 9% █ Sec 6% │
│ ↔ Payouts  │ Lagos 🟢 │ Abuja 🟢 │ PH 🟢 │ Kano 🟡 match 71s │ … [drill-in]  │
│ ⚖ Disputes │ ── Ops queues: KYC 38 · vendor review 12 · disputes 9 SLA⚠2 ──  │
│ 🕵 Fraud   │                                                                  │
│ 📣 Promo   │                                                                  │
│ 📊 Analytics│                                                                 │
│ 🛡 Audit   │                                                                  │
│ ⚙ CMS/Flags│                                                                  │
└────────────┴──────────────────────────────────────────────────────────────────┘
```

### A-02 Vendor Verification Queue (the 5-layer review)
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Vendor review · in_review (12)            [Risk ▾: high▲] [Type: security ▾]  │
│ ┌─ applicant ────────┬─ document viewer (S3 signed) ──────┬─ decision ──────┐ │
│ │ IronShield Ltd     │ ▓ CAC certificate        ✓ auto    │ Identity    ✓  │ │
│ │ Security company   │ ▓ State security license  ✓ expires│ Business    ✓  │ │
│ │ Abuja · 8 yrs      │   2027-03                 │ License  [✓ verify] │ │
│ │ Owner: Musa B.     │ ▓ Liability insurance 50M  ✓ with   │ Insurance  ✓  │ │
│ │ NIN ✓ BVN ✓        │   insurer confirmation       │ Compliance[✓ verify] │ │
│ │ Bank: GTB ✓ penny  │ ▓ Personnel rosters 6/6 bg ✓      │ ──────────────  │ │
│ │ Risk: LOW 🟢       │ ▓ Training certificates ✓         │ [APPROVE w/MFA] │ │
│ └────────────────────┴────────────────────────────────────┴─────────────────┘ │
│ queue: ‹ prev · 1/12 · next ›        every decision writes immutable audit    │
└───────────────────────────────────────────────────────────────────────────────┘
```

### A-03 Escrow & Dispute Ops · A-04 Fraud Console
```
┌───────────────────────────────────────────┐  ┌───────────────────────────────┐
│ Dispute DSP-2291 · ₦15,500 · SLA 18h left │  │ Fraud console · alert FRA-77 │
│ Customer: goods damaged (photo 📸)        │  │ Device cluster: 6 accounts 📱│
│ Vendor: POD photo+signature at 14:32      │  │ same device hash · 3 banks   │
│ GPS timeline ▸ ✓ route · chat log ▸ ✓     │  │ velocity: 11 top-ups/2h     │
│ ( ) Refund full ( ) Partial [₦__] ( ) Deny│  │ risk score 0.94 🔴          │
│ [ Decide — MFA ]  → arbitration if appeal │  │ [ Freeze ] [ Step-up ] [ ✓ ]│
└───────────────────────────────────────────┘  └───────────────────────────────┘
```
