import Link from 'next/link';
import { Badge, Button, Container, DataTable, Logo, SectionTitle, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · Wallet & Loyalty' };

const LEDGER = [
  { memo: 'Top-up · Paystack', amount: '+₦50,000.00', tone: 'brand' as const },
  { memo: 'Ride BKG-8812 → escrow', amount: '−₦16,540.00', tone: 'slate' as const },
  { memo: 'Escrow release refund (partial)', amount: '+₦2,000.00', tone: 'brand' as const },
  { memo: 'Loyalty redemption (2,500 pts)', amount: '+₦2,000.00', tone: 'gold' as const },
  { memo: 'Flight PNR-4F7KQ2 → escrow', amount: '−₦486,200.00', tone: 'slate' as const },
];

const TIERS = [
  ['Basic', '0 pts', 'standard support'],
  ['Silver', '5,000 pts', 'priority matching · 2% discount'],
  ['Gold', '20,000 pts', '4% discount · 2 free cancellations'],
  ['Platinum', '50,000 pts', '6% discount · airport lounge'],
  ['Executive', '150,000 pts', '8% discount · concierge · chauffeur upgrades'],
];

export default function WalletPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5"><Logo /><span className="font-display text-xl font-extrabold text-slate-900">AMSA</span></Link>
          <div className="flex items-center gap-3">
            <Link href="/book"><Button variant="ghost">Book</Button></Link>
            <Link href="/track"><Button variant="ghost">Track</Button></Link>
            <Link href="/wallet"><Button>Wallet</Button></Link>
          </div>
        </Container>
      </header>

      <Container className="py-12">
        <SectionTitle eyebrow="Wallet · Escrow · Loyalty" title="Your money, protected" sub="Pay into escrow — vendors are paid only after delivery. Commission and taxes settle automatically; refunds and disputes handled in-app." />

        <div className="mt-10 grid gap-6 xl:grid-cols-3">
          <section className="xl:col-span-2 space-y-6">
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-700 p-8 text-white">
              <div className="text-xs uppercase tracking-widest text-slate-400">Available balance</div>
              <div className="mt-2 font-display text-4xl font-extrabold">₦248,320.50</div>
              <div className="mt-2 text-sm text-sky-300">₦486,200.00 held in escrow · 1 active hold</div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="secondary">Top up (Paystack · Flutterwave · Monnify)</Button>
                <Button variant="ghost" className="text-white hover:bg-white/10">Send money</Button>
                <Button variant="ghost" className="text-white hover:bg-white/10">Withdraw</Button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Recent activity</h3>
              <div className="mt-4 space-y-2">
                {LEDGER.map((l) => (
                  <div key={l.memo} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                    <div className="text-sm text-slate-700">{l.memo}</div>
                    <div className={`font-semibold ${l.amount.startsWith('+') ? 'text-emerald-600' : 'text-slate-900'}`}>{l.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
              <Badge tone="gold">GOLD member</Badge>
              <div className="mt-3 font-display text-3xl font-extrabold text-slate-900">18,420 pts</div>
              <div className="text-xs text-slate-600">1,580 pts to PLATINUM</div>
              <div className="mt-3 h-2 rounded-full bg-amber-100"><div className="h-2 rounded-full bg-amber-500" style={{ width: '92%' }} /></div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Membership tiers</h3>
              <div className="mt-4">
                <DataTable
                  headers={['Tier', 'Threshold', 'Perks']}
                  rows={TIERS.map(([t, th, p], i) => [i === 2 ? <strong key={t}>{t} ✓</strong> : t, th, <span key={`${t}-p`} className="text-xs text-slate-500">{p}</span>])}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-900 bg-slate-900 p-6 font-mono text-[11px] text-slate-300 shadow-sm">
              POST /v1/wallets/:id/topup · POST /v1/payments/initialize → PSP checkout · POST /v1/loyalty/redeem (₦0.008/pt)
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
