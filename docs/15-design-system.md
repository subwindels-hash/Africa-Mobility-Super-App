# 15 · Design System — AMSA DS v1

**Deliverables:** 34 (Design System) · 35 (Color Palette) · 36 (Typography) · 37 (Component Library)

---

## 34 · Brand & Principles

**Brand idea:** *movement you can trust.* The mark: a forward chevron formed from a road and a shield — motion + protection. Wordmark **AMSA** set in Manrope Bold.

Design principles: **Trust first** (escrow/verification states always visible) · **Fast hands** (book in ≤ 3 taps) · **Safe within reach** (SOS never more than 2 taps away) · **Calm clarity** (one primary action per screen) · **Built for real networks** (lite modes, offline states, low-data media).

## 35 · Color Palette

Primary: **Nigerian green** energy; secondary: **gold** for premium/executive; safety: **red** reserved exclusively for SOS/emergency — never decorative.

### Core palette

| Token | Hex | RGB | Usage |
|---|---|---|---|
| `green/900` | #0B3D2E | 11,61,46 | Deep brand (headers, footer) |
| `green/700` | #146B4A | 20,107,74 | Buttons hover, active nav |
| `green/500` **PRIMARY** | #1DB954→**#17A558** | 23,165,88 | Primary actions, links, CTAs |
| `green/300` | #74D69B | 116,214,155 | Success tint, badges bg |
| `green/100` | #E3F7EB | 227,247,235 | Selected states, tonal fills |
| `gold/600` | #C2932A | 194,147,42 | Premium/executive accents |
| `gold/100` | #FBF3DD | 251,243,221 | Premium tier chips |
| `teal/500` | #0E7C86 | 14,124,134 | Logistics/parcel vertical |
| `sky/500` | #0E67A6 | 14,103,166 | Travel/aviation vertical |
| `slate/900` | #101828 | 16,24,40 | Text primary (light mode) |
| `slate/600` | #475467 | 71,84,103 | Text secondary |
| `slate/400` | #98A2B3 | 152,162,179 | Disabled, placeholders |
| `slate/200` | #E4E7EC | 228,231,236 | Borders/dividers |
| `slate/50` | #F9FAFB | 249,250,251 | Canvas background |
| `white` | #FFFFFF | — | Surfaces |

### Semantic

| Token | Hex | Meaning |
|---|---|---|
| `danger/600` | #D92D20 | **SOS / destructive only** |
| `danger/100` | #FEE4E2 | Error tint |
| `warning/600` | #DC6803 | Expiring docs, SLA warnings |
| `warning/100` | #FEF0C7 | Warning tint |
| `success/600` | #079455 | Verified ✓, escrow released |
| `info/600` | #1570EF | Info, tips, surge badge |

Vertical accents: Ride `green/500` · Send `teal/500` · Fly `sky/500` · Protect `slate/900` (+shield icon) · Charter `gold/600`.

**Contrast:** all text combos ≥ 4.5:1 (AA); buttons ≥ 3:1. Dark theme mirrors with `slate/950` canvas and lightened greens.

## 36 · Typography System

| Role | Family | Weight | Size/Line (mobile) | Size/Line (web) |
|---|---|---|---|---|
| Display | Manrope | 800 | 32/38 | 56/64 |
| H1 | Manrope | 700 | 26/32 | 40/48 |
| H2 | Manrope | 700 | 22/28 | 32/40 |
| H3 | Manrope | 600 | 18/24 | 24/32 |
| Body-L | Inter | 400 | 16/24 | 18/28 |
| Body | Inter | 400 | 14/21 | 16/24 |
| Caption | Inter | 500 | 12/16 | 14/20 |
| Overline/label | Inter | 600 | 10/14 (tracking +0.08em) | 12/16 |
| Numeric/money | Inter Tight (tabular) | 600 | — | — |

- Mobile system fallback: Android `Roboto`, iOS `SF Pro` (Inter loaded as webfont ≤ 120KB subset: latin + Hausa/Yoruba/Igbo diacritics).
- All sizes respect OS dynamic type scaling to 200%; no text below 12px except overline badges.
- Arabic-ready pairing reserved for Phase 3 (UAE): Cairo (headings) + Tajawal (body).

## 37 · Component Library

Implemented as: Web — React + Tailwind + Radix primitives (`web/components/ui`); Flutter — shared widget package (`mobile/lib/core/theme` + `packages/amsa_ui`). Storybook on web; widget catalog pages in Flutter.

### Primitives

| Component | Variants / notes |
|---|---|
| **Button** | primary / secondary / ghost / danger / gold; sizes sm-md-lg; loading state; full-width |
| **Input** | text, phone (country picker), OTP (boxed), money (₦ + separators), search; states: default/focus/error/disabled; helper + error text |
| **Select / BottomSheet picker** | single, multi (stops editor), searchable (cities) |
| **Chip** | filter, selection, info, vertical-colored |
| **Badge** | verification ✓, escrow 🔒, tier (Basic→Executive gold), surge ⚡, expiry ⚠ |
| **Card** | service launcher, class selector, quote compare, booking history |
| **StatCard** | dashboards: value, delta ▲▼, sparkline |
| **Tabs** | segmented (class selector), underline (dashboards) |
| **Avatar** | photo, initials, role ring (driver 🚗 / rider 🏍 / vendor 🏢), rating overlay ★ |
| **Rating** | display + input (stars + tags) |
| **Toast/Snackbar** | success/info/error; action link; auto-dismiss 4s |
| **Modal/Sheet** | confirm (danger), form, receipt viewer |
| **Skeleton** | shimmer loaders for cards/lists/maps |
| **Empty state** | illustration + CTA ("No trips yet — book your first ride") |

### Composite patterns (domain components)

| Component | Contents |
|---|---|
| `FareEstimateCard` | price range + confidence, surge badge w/ ⓘ explainer, ETA, class icon |
| `BookingStateTimeline` | vertical stepper w/ timestamps + live pulse on active |
| `TrackingMap` | Google/OSM switch, driver marker w/ heading, route polyline, pickup/drop pins, ETA chip |
| `EscrowStatusPill` | FUNDED/HELD/RELEASED etc. with lock icon + tooltip "money protected" |
| `VerificationBadgeGroup` | Identity/Business/License/Insurance/Compliance ✓ with expiry colors |
| `SosRail` | persistent bottom rail: SOS slide, share, masked call — on all active-service screens |
| `OfferCard` (driver) | fare earn, distance, pickup/drop, countdown ring 15s, accept/decline |
| `StopsEditor` | drag-reorder stops ≤ 8, per-stop OTP/POD chips |
| `QuoteCompareTable` | vendors × price × milestones × badges |
| `LedgerTable` | dashboards: journal entries w/ D/C, filters, CSV export |
| `ApprovalInboxRow` | requester, amount, policy reason chip, approve/reject (MFA) |
| `ChatComposer` | text, mic (hold→Opus), attachment (image/PDF ≤25MB), location pin; typing + read |
| `LoyaltyProgressBar` | tier, points, next-tier delta |

### Iconography & illustration

- Icons: **Lucide** (web) + `flutter_lucide` (mobile); 24px grid, 1.75px stroke; SOS icon custom (shield-exclamation).
- Illustrations: flat geometric, green/gold duotone; empty states + onboarding only.

### Spacing, radius, elevation

| Token | Value |
|---|---|
| spacing scale | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 |
| radius | sm 8 · md 12 · lg 16 · xl 24 · pill 999 |
| elevation | 0 flat · 1 card (y2/8%) · 2 dropdown (y8/16%) · 3 modal (y16/24%) |
| motion | 150ms ease-out (standard) · 250ms (sheets) · respect `prefers-reduced-motion` |

### Accessibility checklist (component gates)

Focus visible on all interactive · hit area ≥ 44×44 · contrast AA · screen-reader labels on icons-only buttons · SOS = also hardware shortcut (volume-down ×3) · color never sole signal (badge + icon + text).
