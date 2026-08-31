import Link from 'next/link';
import { Badge, Button, Container, DataTable, Logo, SectionTitle, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · Vendor onboarding' };

const STEPS = [
  { n: 1, name: 'Account created', status: 'approved' },
  { n: 2, name: 'Business registration (CAC)', status: 'approved' },
  { n: 3, name: 'Tax ID (TIN) verified', status: 'approved' },
  { n: 4, name: 'Identity KYC (BVN/NIN)', status: 'approved' },
  { n: 5, name: 'Address verification', status: 'approved' },
  { n: 6, name: 'Insurance certificate', status: 'approved' },
  { n: 7, name: 'Asset / vehicle inspection', status: 'under_review' },
  { n: 8, name: 'Driver & staff background check', status: 'pending' },
  { n: 9, name: 'Safety compliance audit', status: 'pending' },
  { n: 10, name: 'Bank account verification', status: 'pending' },
  { n: 11, name: 'Admin final approval → ACTIVATION', status: 'pending' },
];

const TIERS = [
  ['Free', '₦0/mo', '20 bookings · 2 assets · 20% commission'],
  ['Standard', '₦15,000/mo', '200 bookings · 15 assets · 17% commission'],
  ['Professional', '₦60,000/mo', '1,000 bookings · 75 assets · 14% + API'],
  ['Enterprise', '₦250,000/mo', 'Unlimited · 500 assets · 10% + SLA 99.9%'],
];

export default function VendorOnboardingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5"><Logo /><span className="font-display text-xl font-extrabold text-slate-900">AMSA</span></Link>
          <div className="flex items-center gap-3">
            <Link href="/vendor"><Button variant="ghost">Vendor console</Button></Link>
            <Link href="/vendor/onboarding"><Button>Onboarding</Button></Link>
          </div>
        </Container>
      </header>

      <Container className="py-12">
        <SectionTitle eyebrow="Vendor marketplace" title="Get verified. Get bookings." sub="16 vendor types — from taxi operators to luxury vehicle owners. Every provider completes the 11-step verification chain before marketplace activation." />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Verification" value="Step 7 / 11" sub="asset inspection in review" />
          <StatCard label="Vendor type" value="Interstate Freighter" sub="truck + trailer fleet" />
          <StatCard label="Marketplace status" value="Not yet listed" sub="activates after admin approval" />
          <StatCard label="Documents" value="9 / 12" sub="3 uploads pending" />
        </div>

        <div className="mt-10 grid gap-6 xl:grid-cols-3">
          <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">The 11-step verification chain</h3>
            <ol className="mt-5 space-y-2">
              {STEPS.map((s) => (
                <li key={s.n} className="flex items-center gap-4 rounded-xl border border-slate-100 px-4 py-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold
                    ${s.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : s.status === 'under_review' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                    {s.status === 'approved' ? '✓' : s.n}
                  </div>
                  <div className="flex-1 text-sm font-medium text-slate-800">{s.name}</div>
                  {s.status === 'approved' && <Badge tone="brand">approved</Badge>}
                  {s.status === 'under_review' && <Badge tone="warning">in review</Badge>}
                  {s.status === 'pending' && <Badge tone="slate">pending</Badge>}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-slate-500">Steps are sequential — a rejected step returns the application to you. Admin approval is the final gate; activation is automatic once granted.</p>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Subscription tiers</h3>
              <div className="mt-4">
                <DataTable
                  headers={['Tier', 'Price', 'Limits']}
                  rows={TIERS.map(([t, p, l]) => [<strong key={t}>{t}</strong>, p, <span key={`${t}-l`} className="text-xs text-slate-500">{l}</span>])}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-900 bg-slate-900 p-6 font-mono text-[11px] text-slate-300 shadow-sm">
              POST /v1/vendors → register<br />POST /v1/vendors/:id/verification/:step<br />POST /v1/vendors/:id/subscription
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
