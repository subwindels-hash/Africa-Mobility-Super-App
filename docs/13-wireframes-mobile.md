# 13 · Mobile Wireframes — Customer App · Driver App · Rider App

**Deliverables:** 27 (Customer) · 28 (Driver) · 29 (Rider) · Design tokens: `15-design-system.md`

Legend: `[ ]` button · `( )` chip/tab · `▸` list item · `▓` map/media · `⌂` bottom nav

---

## 27 · CUSTOMER APP

### C-01 Splash / Onboarding
```
┌─────────────────────────────┐      ┌─────────────────────────────┐      ┌─────────────────────────────┐
│                             │      │  ●      ●      ●            │      │  Choose your language       │
│                             │      │                             │      │                             │
│         [AMSA LOGO]         │      │   ▓▓▓ illustration ▓▓▓      │      │  ( ) English                │
│                             │      │                             │      │  ( ) Hausa                  │
│   Move anything.            │      │   One app for every         │      │  ( ) Yorùbá                 │
│   Send anything.            │      │   ride, delivery &          │      │  ( ) Igbo                   │
│   Go anywhere.              │      │   trip you need.            │      │  ( ) Pidgin                 │
│                             │      │                             │      │                             │
│  Verified vendors. Escrow-  │      │   Verified vendors, escrow- │      │         [ Continue ]        │
│  protected payments.        │      │   protected payments, SOS.  │      │                             │
│                             │      │         [ Next ]            │      │                             │
└─────────────────────────────┘      └─────────────────────────────┘      └─────────────────────────────┘
```

### C-02 Auth (OTP)
```
┌─────────────────────────────┐
│  ←                          │
│  Welcome to AMSA            │
│  Enter your phone number    │
│  ┌─────────────────────────┐│
│  │ 🇳🇬 +234 | 801 234 5678 ││
│  └─────────────────────────┘│
│  We'll text you a code.     │
│  ─────────────────────────  │
│  ( ) Continue with Google   │
│  ( ) Continue with Apple    │
│                             │
│  [ Send code ]              │
│  By continuing you accept   │
│  Terms & Privacy (NDPR)     │
└─────────────────────────────┘
```

### C-03 Home — Service Launcher
```
┌─────────────────────────────┐
│ ☰  Good morning, Amaka 🔆   │  ← avatar, loyalty: GOLD, 🔔
│ ┌─────────────────────────┐ │
│ │ 🔍 Where to? What to    │ │  ← universal search: destination /
│ │    send? Where to fly?  │ │     vendor / tracking code
│ └─────────────────────────┘ │
│ ┌──────┬──────┬──────┬────┐ │
│ │ 🚗   │ 📦   │ ✈️   │ 🛡 │ │  ← RIDE / SEND / FLY / PROTECT
│ │Ride  │Send  │Fly   │Safe│ │
│ ├──────┼──────┼──────┼────┤ │
│ │ 🚁   │ 🚐   │ 🏢   │ ⭐ │ │  ← Charter(flag) / Intercity /
│ │Fly   │City  │Corp  │Pts │ │     Corporate / Rewards
│ │Prvt  │Bus   │      │    │ │
│ └──────┴──────┴──────┴────┘ │
│ Wallet ₦42,500  [+ Fund]    │
│ ── Recent ────────────────  │
│ ▸ 🚗 Home → Work  ₦8,200 ✓ │
│ ▸ 📦 POD-4471     ₦3,500 ✓ │
│ ▸ ✈️ LOS→ABV      ₦78,000 ✓│
│ ── Promo banner ──────────  │
│ ▓ RIDE20: 20% off 2 rides ▓ │
│  ⌂Home   ▤Activity  💬  👤 │
└─────────────────────────────┘
```

### C-04 Ride Booking (class selector + fare estimate)
```
┌─────────────────────────────┐
│  ←                ⚖ Languages│
│ ┌─────────────────────────┐ │
│ │ ▓▓▓▓▓ MAP ▓▓▓▓▓▓▓▓▓▓▓▓ │ │
│ │ ▓▓ 📍 pickup set ▓▓▓▓▓ │ │
│ │ ▓▓ (drag pin) ▓▓▓▓▓▓▓▓ │ │
│ └─────────────────────────┘ │
│ ● Ikeja City Mall      [✕]  │  ← destination search list
│ ● Work — Adeola Odeku       │
│ ── Choose class ──────────  │
│ ┌─────────────────────────┐│
│ │ Economy  4 min  ₦6–7k   ││ ← horizontally swipeable cards
│ │ Standard 6 min  ₦9–11k  ││   (Economy→VIP→SUV→Chauffeur)
│ │ Premium  8 min  ₦14–17k ││
│ └─────────────────────────┘│
│ ⚡ Demand high (1.2×) ⓘ     │  ← surge transparency
│ (💾 Wallet ₦42,500) (💳)   │
│ (🕐 Schedule) (+3 Stops)   │
│ [ Confirm Premium ]        │
└─────────────────────────────┘
```

### C-05 Matching → Confirmed
```
┌─────────────────────────────┐      ┌─────────────────────────────┐
│  Finding your Premium ride… │      │  Driver on the way 🚗       │
│  ┌─────────────────────────┐│      │ ┌─────────────────────────┐│
│  │ ◌◌◌ pulsing radar ◌◌◌  ││      │ │ ▓▓ MAP: live car ▓▓▓▓▓ ││
│  └─────────────────────────┘│      │ │ ▓▓ moving toward you ▓▓ ││
│  98% matched within 60s     │      │ └─────────────────────────┘│
│  ████████░░ matching        │      │ 👤 Mr. Ade ★4.9  ✅Verified│
│                             │      │ Toyota Camry · Silver      │
│  [ Cancel ]                 │      │ ABC-123-XY  4 min away     │
│                             │      │ 💰 ₦15,500 held in escrow🔒│
│                             │      │ (📞 Masked call)(💬 Chat) │
│                             │      │ (🔗 Share trip)(🆘 SOS)   │
│                             │      │ [ Cancel · free 60s ]      │
└─────────────────────────────┘      └─────────────────────────────┘
```

### C-06 In-Trip
```
┌─────────────────────────────┐
│ ┌─────────────────────────┐ │
│ │ ▓▓▓▓▓ live route ▓▓▓▓▓ │ │
│ │ ▓ ETA 14:32 ▓▓▓▓▓▓▓▓▓▓ │ │
│ └─────────────────────────┘ │
│ ●●●●○○○○ trip progress      │
│ On track · 12 min to go     │
│ Trusted contacts notified 🌙│  ← night trip auto-share
│ (💬 Chat) (📞) (🔗 Share)   │
│ ┌─────────────────────────┐│
│ │ 🆘 SOS  — slide to call ││  ← persistent safety rail
│ └─────────────────────────┘│
└─────────────────────────────┘
```

### C-07 Completion & Rating
```
┌─────────────────────────────┐
│  ✓ Arrived — Ikeja City Mall│
│  Trip fare   ₦15,500        │
│  Escrow released to vendor 🔒│
│  🧾 Receipt (PDF) → email    │
│ ── Rate Mr. Ade ──────────  │
│    ☆ ☆ ☆ ☆ ☆                │
│  ( ) Safe driving ( ) Clean │
│  ( ) Great conversation     │
│  Tip: (₦0)(₦500)(₦1000)(₦2k)│
│  [ Submit ]                 │
│  ⭐ +155 pts → GOLD 6,240pts│
└─────────────────────────────┘
```

### C-08 Send (Logistics)
```
┌─────────────────────────────┐        ┌─────────────────────────────┐
│  Send a package 📦          │        │  Pickup & dropoff           │
│  What are you sending?      │        │ ● Your location             │
│  ┌────────────────────────┐ │        │   Lekki Phase 1             │
│  │ 📄 Documents  📦 Parcel│ │        │ ● Yaba · Ada 0803…         │
│  │ 🛍 Shopping  🍱 Food   │ │        │   + Add stop (2/8)         │
│  └────────────────────────┘ │        │ ── Speed ─────────────────  │
│  Size: (S)(M)(L)(XL)        │        │ (⚡ Dispatch <90m) (🕐 Same)│
│  Weight ~ 2kg  📸 Photo     │        │ Recipient gets OTP at drop  │
│  Value: ₦45,000 (insured ⓘ) │        │ [ Get quote ]               │
│  [ Continue ]               │        └─────────────────────────────┘
└─────────────────────────────┘
```

### C-09 Fly (Travel)
```
┌─────────────────────────────┐      ┌─────────────────────────────┐
│ ✈️ Book a flight            │      │ LOS → ABV · 12 Sep          │
│ ( ) One-way (•) Return ( )  │      │ ┌─────────────────────────┐│
│  Multi-city                 │      │ │ Air Peace P4…  07:20→   ││
│ ● LOS Lagos   ● ABV Abuja   │      │ │ 08:35  · 1h15m · Nonstop││
│ Date 12–16 Sep (±3 flex)    │      │ │ ₦78,500 + ₦1,500 fee    ││
│ ( ) 1 Adult ( ) Economy ▾   │      │ ├─────────────────────────┤│
│ [ Search flights ]          │      │ │ Ibom Air … ₦82,000      ││
│                             │      │ └─────────────────────────┘│
│                             │      │ (✅ escrow until ticket)   │
│                             │      │ [ Continue — pay with hold]│
└─────────────────────────────┘      └─────────────────────────────┘
```

### C-10 Protect (Security Marketplace)
```
┌─────────────────────────────┐      ┌─────────────────────────────┐
│ 🛡 Verified protection       │      │  Your quotes (2/3)          │
│ What do you need?           │      │ ┌─────────────────────────┐│
│ (👤 Exec protection)(🚗 VIP │      │ │🛡 SafeGuard NG ★4.8     ││
│  escort)(🚙 Convoy)(🏍      │      │ │✅Licensed ✅Insured ✅…  ││
│  Security driver)(🎪 Event)│      │ │₦850,000 · 3 days        ││
│ (🏢 Corporate)(🏠 Home)     │      │ │2 agents + lead vehicle  ││
│                             │      │ ├─────────────────────────┤│
│ Scope builder:              │      │ │🛡 IronShield ★4.7       ││
│ Dates 14–16 Sep · Lagos     │      │ │₦920,000 · milestone pay││
│ Personnel 2 · Route risk ⓘ  │      │ └─────────────────────────┘│
│ [ Request quotes ]          │      │ [ Accept — fund escrow 🔒 ]│
└─────────────────────────────┘      └─────────────────────────────┘
```

### C-11 Wallet · C-12 Safety · C-13 Profile
```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ Wallet      [+Fund] │  │ 🛡 Safety Centre     │  │ Amaka Obi   [GOLD]  │
│ ₦42,500 available   │  │ (🆘 SOS test)       │  │ ✅ KYC L2 verified  │
│ ₦3,200 pending escrow│ │ (👪 Trusted contacts)│  │ ── Accounts ──────  │
│ (Send)(Withdraw)     │  │ (🔗 Live trip share)│  │ ▸ Payment methods   │
│ ── Methods ────────  │  │ (🌙 Night auto-share)│ │ ▸ Saved places      │
│ 💳 VISA •••• 4081    │  │ (🧍 Face verification)│ │ ▸ Language: English │
│ 🏦 GTB ••• 8842      │  │ (ⓘ Trip safety tips)│  │ ▸ Become a driver   │
│ ── Rewards ────────  │  │ ── History ──────── │  │ ▸ Family & diaspora │
│ ⭐ 6,240 pts · 1.5%  │  │ ▸ 12 Aug SOS test ✓ │  │ ▸ Corporate account │
│ cashback (GOLD)      │  │ ▸ Trips shared: 38  │  │ [ Sign out ]        │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

---

## 28 · DRIVER APP

### D-01 Online Home (dispatch console)
```
┌─────────────────────────────┐
│ 🟢 ONLINE   Lagos · VI      │  ← toggle
│ ┌─────────────────────────┐ │
│ │ ▓▓▓ demand heatmap ▓▓▓▓ │ │  ← red zones = bonus demand
│ │ ▓▓ (your position) ▓▓▓▓ │ │
│ └─────────────────────────┘ │
│ Today: ₦32,400 · 9 trips    │
│ ★4.9 · acceptance 94% ✓     │
│ ── Target bonus ──────────  │
│ ████████░░ 10/12 → +₦5,000 │
│ (📋 Jobs)(🧾 Earnings)(👤)  │
│ ┌─────────────────────────┐│
│ │🆘 Emergency · long-press││
│ └─────────────────────────┘│
└─────────────────────────────┘
```

### D-02 Incoming Offer (15s) → D-03 Trip Flow
```
┌─────────────────────────────┐      ┌─────────────────────────────┐
│ ⏱ 00:12                     │      │ En route to pickup → ▶     │
│ ┌─────────────────────────┐ │      │ ┌─────────────────────────┐│
│ │ 🚗 PREMIUM · 8.2km 25min│ │      │ │ ▓▓ navigation (Google) ▓││
│ │ Pickup: Eko Hotel       │ │      │ └─────────────────────────┘│
│ │ Dropoff: Murtala Muham. │ │      │ 👤 Amaka ★4.8 · 📞 masked │
│ │ Intl Airport (T2)       │ │      │ [ Arrived ]  OTP on pickup│
│ │ Earn ₦13,900 💰         │ │      │ ● pickup ●→ ○ dropoff     │
│ └─────────────────────────┘ │      │ (💬)(🆘 SOS)              │
│ [ ✕ Decline ]  [ ✓ Accept ] │      │ fare locked ₦15,500 🔒    │
└─────────────────────────────┘      └─────────────────────────────┘
```
```
┌─────────────────────────────┐      ┌─────────────────────────────┐
│ Enter pickup OTP            │      │ ✓ Trip complete             │
│ ┌──┬──┬──┬──┐               │      │ Fare ₦15,500                │
│ │ 4│ 7│ ▓│ ▓│  ← customer   │      │ Your earnings (70%) ₦9,730  │
│ └──┴──┴──┴──┘               │      │ Paid to wallet instantly ✓  │
│ (Can't find them? Call 📞)  │      │ ★ you rated passenger       │
│ [ Verify & start trip ]     │      │ Next: 🟢 waiting for jobs   │
└─────────────────────────────┘      └─────────────────────────────┘
```

### D-04 Earnings & Cashout · D-05 Daily Activation
```
┌─────────────────────┐  ┌─────────────────────┐
│ Earnings            │  │ 🤳 Daily activation  │
│ Today ₦32,400       │  │ Look straight into   │
│ This week ₦186,200  │  │ the camera           │
│ ── Breakdown ─────  │  │ ┌─────────────────┐ │
│ Trips 42            │  │ │  ( camera )     │ │
│ Tips ₦6,500         │  │ └─────────────────┘ │
│ Bonuses ₦10,000     │  │ [ Verify face ]     │
│ Wallet ₦210,850     │  │ Keeps your account  │
│ [⚡ Instant cashout │  │ safe from misuse    │
│  1.5%] [ Bank T+1 ] │  └─────────────────────┘
└─────────────────────┘
```

---

## 29 · RIDER APP (Dispatch)

### R-01 Available Jobs → R-02 Delivery Run
```
┌─────────────────────────────┐      ┌─────────────────────────────┐
│ 🟢 ONLINE · Ikeja zone      │      │ Delivery POD-4471  stop 2/4 │
│ ── Nearby jobs ──────────   │      │ ┌─────────────────────────┐│
│ ▸ 📦 Document Yaba→VI       │      │ │ ▓ route (optimized) ▓▓▓ ││
│   6.1km · ₦3,200 · ⚡15m   │      │ │ 1✓ 2● → 3○ 4○          ││
│ ▸ 📦 Parcel Ikeja→Ogba      │      │ └─────────────────────────┘│
│   3.4km · ₦2,800            │      │ Drop: Ada · 0803…         │
│ ▸ 🛍 2-stop shopping Surul. │      │ Say: "POD code?" → 4 7 ▓ ▓ │
│   9.0km · ₦6,500            │     │ 📸 Photo of handover       │
│ ── Heat ─────────────────   │      │ [ Complete stop ]          │
│ ▓▓▓ demand map ▓▓▓          │      │ (📞)(🆘)                   │
└─────────────────────────────┘      └─────────────────────────────┘
```

### R-03 POD & Earnings
```
┌─────────────────────┐
│ ✓ POD-4471 done      │
│ Recipient verified ✓ │
│ 📸 photo · 📍geo ⏱14:32│
│ Earned ₦3,200 → wallet│
│ Today ₦18,600 · 7 jobs│
│ [⚡ Cashout] [ Next ] │
└─────────────────────┘
```
