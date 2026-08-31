import Link from 'next/link';
import { Badge, Button, Container, Logo, SectionTitle } from '@/components/ui';

export const metadata = { title: 'AMSA · Book a service' };

const SERVICES = [
  { icon: '🚗', title: 'Ride', desc: 'Economy · Comfort · VIP · Luxury chauffeur. Upfront fare, live tracking.', href: '#ride', tone: 'brand' as const },
  { icon: '🚚', title: 'Interstate freight', desc: 'FTL/LTL, cold chain, heavy haul — 21 services, verified truckers.', href: '#freight', tone: 'teal' as const },
  { icon: '📦', title: 'Send', desc: 'Bike dispatch & parcels in minutes, proof of delivery included.', href: '#send', tone: 'brand' as const },
  { icon: '✈️', title: 'Fly', desc: 'Flights via Amadeus + Sabre; charter jets, helicopters, air ambulance.', href: '#fly', tone: 'sky' as const },
  { icon: '🛡', title: 'Protect', desc: 'Bodyguards, VIP convoys, event & executive protection.', href: '#protect', tone: 'slate' as const },
  { icon: '🏨', title: 'Stay', desc: 'Hotels & short-lets with free-cancellation windows.', href: '#stay', tone: 'sky' as const },
  { icon: '🛠', title: 'Rescue', desc: 'Tow, jump-start, fuel, tyre, locksmith — nearest provider dispatched.', href: '#rescue', tone: 'warning' as const },
  { icon: '🚐', title: 'Intercity', desc: 'Scheduled coaches Lagos ↔ Abuja ↔ Kano, VIP sleepers.', href: '#intercity', tone: 'brand' as const },
];

const STEPS = [
  { n: '1', title: 'Choose your service', desc: 'The catalog shows only what FAMS has activated for your state — nothing stale.' },
  { n: '2', title: 'Compare & book', desc: 'AI ranks verified providers on price, rating, ETA and capacity.' },
  { n: '3', title: 'Pay into escrow', desc: 'Card, transfer, USSD via Paystack/Flutterwave/Monnify — or wallet.' },
  { n: '4', title: 'Track to the door', desc: 'Live GPS, checkpoints, ETA updates and shareable tracking links.' },
];

export default function BookPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5"><Logo /><span className="font-display text-xl font-extrabold text-slate-900">AMSA</span></Link>
          <div className="flex items-center gap-3">
            <Link href="/track"><Button variant="ghost">Track</Button></Link>
            <Link href="/wallet"><Button variant="ghost">Wallet</Button></Link>
            <Link href="/book"><Button>Book now</Button></Link>
          </div>
        </Container>
      </header>

      <Container className="py-12">
        <SectionTitle eyebrow="One app · Every service" title="Book anything that moves" sub="Transportation, logistics, travel, aviation, security and roadside — escrow-protected, FAMS-verified, live-tracked." />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <div key={s.title} id={s.href.slice(1)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="text-3xl">{s.icon}</div>
              <h3 className="mt-3 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge tone={s.tone}>escrow protected</Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-3xl bg-slate-900 p-8 text-white sm:p-12">
          <h2 className="font-display text-2xl font-bold">How a booking works</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 font-bold text-slate-900">{s.n}</div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-300">{s.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 font-mono text-xs text-slate-400">POST /v1/interstate/quote · POST /v1/travel/search · POST /v1/verticals/security/book — every vertical behind one booking pipeline.</p>
        </div>

        <div className="mt-16">
          <SectionTitle eyebrow="Mobile-first" title="Prefer the app?" sub="The full experience — SOS shake detection, offline queues, voice notes to Ada — lives in the Flutter apps (customer · driver · rider)." />
          <div className="mt-6 flex flex-wrap gap-3">
            <Badge tone="brand">🤖 Android</Badge>
            <Badge tone="sky">🍎 iOS</Badge>
            <Badge tone="gold">💬 Chat with Ada on WhatsApp</Badge>
          </div>
        </div>
      </Container>
    </div>
  );
}
