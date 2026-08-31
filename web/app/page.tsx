import Link from 'next/link';
import { Badge, Button, Container, Logo, SectionTitle } from '@/components/ui';

const VERTICALS = [
  { icon: '🚗', title: 'Ride', desc: 'Economy → Luxury, VIP, chauffeur, airport & intercity — every class, verified drivers.', tone: 'brand' as const },
  { icon: '📦', title: 'Send', desc: 'Bike dispatch, courier, parcels & multi-stop logistics with proof of delivery.', tone: 'teal' as const },
  { icon: '✈️', title: 'Fly', desc: 'Domestic & international flights via Amadeus/Sabre — escrow-held until ticketed.', tone: 'sky' as const },
  { icon: '🛡', title: 'Protect', desc: 'Executive protection, VIP escort, convoy & event security from licensed firms.', tone: 'slate' as const },
  { icon: '🚁', title: 'Charter', desc: 'Private jets, helicopters, charter flights & air ambulance — quote in hours.', tone: 'gold' as const },
  { icon: '🏢', title: 'Corporate', desc: 'Budgets, approvals, monthly billing & analytics for company travel and fleet.', tone: 'brand' as const },
];

const FLOW = [
  { step: '1', title: 'Customer requests', desc: 'Ride, delivery, flight or protection — upfront price, no haggling.' },
  { step: '2', title: 'Vendor matched', desc: 'AI ranks verified providers by proximity, rating and capacity.' },
  { step: '3', title: 'Payment held in escrow', desc: 'Your money is protected — vendors only get paid on delivery.' },
  { step: '4', title: 'Service delivered & released', desc: 'Commission + VAT settled automatically. Vendor paid same-day.' },
];

const CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan', 'Onitsha', 'Awka', 'Enugu', 'Benin City', 'Asaba'];

export default function LandingPage() {
  return (
    <div className="bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-xl font-extrabold tracking-tight text-slate-900">AMSA</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#verticals" className="hover:text-brand-600">Services</a>
            <a href="#trust" className="hover:text-brand-600">Escrow & Safety</a>
            <a href="#cities" className="hover:text-brand-600">Cities</a>
            <Link href="/vendor" className="hover:text-brand-600">Vendors</Link>
            <Link href="/corporate" className="hover:text-brand-600">Corporate</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" href="/admin" className="!px-4">Admin demo</Button>
            <Button href="#download">Get the app</Button>
          </div>
        </Container>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <Container className="grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <Badge tone="brand">🇳🇬 Launching Nigeria · Built for Africa & the world</Badge>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-6xl">
              Move anything.<br />
              <span className="text-brand-600">Send anything.</span><br />
              Go anywhere.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              One super app for rides, delivery, flights, private aviation and verified security —
              with <strong className="text-slate-900">escrow-protected payments</strong> and an SOS
              button on every journey. AMSA owns no cars and no planes: every service is delivered
              by verified vendors we licence, vet and score.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="#download">Download AMSA</Button>
              <Button variant="secondary" href="/vendor">Grow your business →</Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-500">
              <span>🔒 Escrow on every booking</span>
              <span>🛡 5-layer vendor verification</span>
              <span>🗣 English · Hausa · Yorùbá · Igbo · Pidgin</span>
            </div>
          </div>

          {/* Phone mock */}
          <div className="mx-auto w-full max-w-sm">
            <div className="rounded-[2.5rem] border-8 border-slate-900 bg-slate-900 shadow-2xl">
              <div className="overflow-hidden rounded-[2rem] bg-white">
                <div className="bg-brand-600 px-5 pb-6 pt-8 text-white">
                  <p className="text-xs opacity-80">Good morning, Amaka · <span className="font-semibold">GOLD ⭐</span></p>
                  <p className="mt-3 text-sm opacity-80">Wallet balance</p>
                  <p className="font-display text-3xl font-bold">₦42,500</p>
                </div>
                <div className="grid grid-cols-4 gap-2 p-4">
                  {['🚗 Ride', '📦 Send', '✈️ Fly', '🛡 Protect', '🚁 Charter', '🚐 Intercity', '🏢 Corp', '⭐ Points'].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-3 text-center text-[10px] font-semibold text-slate-600">
                      <span className="text-lg" aria-hidden>{s.split(' ')[0]}</span>
                      {s.split(' ')[1]}
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-4">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>On the way · Premium</span>
                      <Badge>🔒 In escrow</Badge>
                    </div>
                    <p className="mt-2 font-display text-lg font-bold text-slate-900">₦15,500 · 4 min away</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-2/3 rounded-full bg-brand-500" />
                    </div>
                    <div className="mt-3 flex justify-between text-[11px] font-medium text-slate-500">
                      <span>Picked up ✓</span><span>En route ●</span><span>Dropoff ○</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-center rounded-xl bg-red-50 py-2.5 text-xs font-bold text-danger-600">
                    🆘 SOS — help is 2 taps away
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Verticals */}
      <section id="verticals" className="py-20 sm:py-24">
        <Container>
          <SectionTitle
            center
            eyebrow="One app · Twelve verticals"
            title="Every service that moves you, your goods and your people"
            sub="A technology marketplace: AMSA owns no vehicles, aircraft or security firms — we verify the providers, protect the payments and guarantee the quality."
          />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {VERTICALS.map((v) => (
              <div key={v.title} className="group rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-3xl" aria-hidden>{v.icon}</span>
                  <Badge tone={v.tone}>{v.title}</Badge>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-slate-900">{v.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{v.desc}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Escrow & safety */}
      <section id="trust" className="bg-slate-900 py-20 text-white sm:py-24">
        <Container>
          <div className="grid gap-14 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">The trust layer</p>
              <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Your money is held in escrow until the job is done</h2>
              <p className="mt-4 text-slate-300">
                Pay the platform, not a stranger. Funds release only on verified completion —
                with commission, VAT and vendor payouts settled automatically. Disputes get
                evidence-based arbitration within 72 hours.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {FLOW.map((f) => (
                  <div key={f.step} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 font-display text-sm font-bold">{f.step}</span>
                    <p className="mt-3 font-semibold">{f.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">Safety, everywhere</p>
              <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">An SOS button on every screen</h2>
              <ul className="mt-6 space-y-4 text-slate-300">
                {[
                  ['🆘', 'SOS + emergency calling', '2-tap SOS opens a live incident with location, dials our response line and alerts trusted contacts.'],
                  ['📍', 'Live trip sharing', 'Expiring share links with live GPS — for family or the ops room.'],
                  ['🤳', 'Face verification', 'Drivers and riders verify daily with liveness checks.'],
                  ['🕵️', 'AI fraud monitoring', 'Device fingerprinting and real-time risk scoring protect every naira.'],
                  ['✅', 'Verified, licensed, insured', '5-layer checks for security providers: identity, business, licence, insurance, compliance.'],
                ].map(([icon, t, d]) => (
                  <li key={t} className="flex gap-4">
                    <span className="text-2xl" aria-hidden>{icon}</span>
                    <div><p className="font-semibold text-white">{t}</p><p className="text-sm text-slate-400">{d}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* WhatsApp-first */}
      <section className="border-y border-slate-200 bg-slate-50 py-16">
        <Container className="flex flex-col items-center gap-6 text-center">
          <Badge tone="brand">💬 WhatsApp-first</Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            No app? No problem. Meet <span className="text-brand-600">Ada</span> on WhatsApp.
          </h2>
          <p className="max-w-2xl text-slate-600">
            Chat with our AI assistant to discover services, compare fares, book rides &amp; deliveries,
            pay with secure escrow links and track your driver — in English, Hausa, Yoruba, Igbo or Pidgin.
            Send a voice note, a location pin or even a screenshot of an address. Ada understands.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button href="https://wa.me/2340000000000">💬 Chat with Ada</Button>
            <Button variant="secondary" href="/admin/whatsapp">See the AI ops console</Button>
          </div>
        </Container>
      </section>

      {/* Cities */}
      <section id="cities" className="py-20 sm:py-24">
        <Container>
          <SectionTitle center eyebrow="Phase 1 · Nigeria" title="10 cities at launch. Unlimited by design." sub="Phase 2: Ghana, Kenya, South Africa · Phase 3: UAE, UK, USA diaspora corridors — multi-currency, multi-language, multi-tax from day one." />
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            {CITIES.map((c) => (
              <span key={c} className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm">{c}</span>
            ))}
            <span className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm">+ your city next →</span>
          </div>
        </Container>
      </section>

      {/* Vendor CTA */}
      <section className="bg-brand-50 py-20">
        <Container className="flex flex-col items-center gap-8 text-center">
          <SectionTitle center eyebrow="For vendors & drivers" title="Demand, guaranteed payment, free tools" sub="15 vendor types — fleets, riders, travel agencies, security firms, jet operators. Zero commission for your first 60 days in a new city." />
          <div className="flex flex-wrap justify-center gap-3">
            <Button href="/vendor">Open Vendor Console demo</Button>
            <Button variant="gold" href="/corporate">Corporate portal demo</Button>
          </div>
        </Container>
      </section>

      {/* Download */}
      <section id="download" className="py-20">
        <Container className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Get AMSA today</h2>
            <p className="mt-4 text-slate-600">Free on Android and iOS. Under 40MB, works on low bandwidth, five Nigerian languages.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">🤖 Google Play</span>
              <span className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white">🍎 App Store</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[['250k+', 'Target installs (M18)'], ['6,500', 'Vendors & drivers'], ['10', 'Launch cities'], ['8–20%', 'Fair, transparent commission']].map(([v, l]) => (
              <div key={l} className="rounded-2xl border border-slate-200 p-6 text-center">
                <p className="font-display text-3xl font-extrabold text-brand-600">{v}</p>
                <p className="mt-1 text-sm text-slate-500">{l}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <footer className="border-t border-slate-200 py-12">
        <Container className="flex flex-col items-center justify-between gap-6 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2.5"><Logo small /><span className="font-semibold text-slate-700">AMSA — Africa Mobility Super App</span></div>
          <p>Escrow-protected. Verified. Safe. · NDPR & GDPR aligned · © 2026</p>
          <div className="flex gap-5">
            <Link href="/vendor" className="hover:text-brand-600">Vendors</Link>
            <Link href="/corporate" className="hover:text-brand-600">Corporate</Link>
            <Link href="/admin" className="hover:text-brand-600">Admin</Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}
