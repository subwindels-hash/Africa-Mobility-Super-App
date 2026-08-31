import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA Admin Control Center' };

const NAV = [
  { label: 'Overview', icon: '▤', active: true },
  { label: 'WhatsApp AI', icon: '💬' },
  { label: 'KYC queue', icon: '🕵' },
  { label: 'Vendor review', icon: '🏢' },
  { label: 'Users', icon: '👤' },
  { label: 'Bookings', icon: '🚗' },
  { label: 'Payments', icon: '💰' },
  { label: 'Escrow & payouts', icon: '🔒' },
  { label: 'Disputes', icon: '⚖' },
  { label: 'Fraud console', icon: '🚨' },
  { label: 'Incidents (SOS)', icon: '🆘' },
  { label: 'Promotions', icon: '📣' },
  { label: 'Analytics', icon: '📊' },
  { label: 'Audit log', icon: '🛡' },
  { label: 'CMS / Flags', icon: '⚙' },
];

const VERTICALS = [
  ['Transportation', '58%', '₦96M', <Badge key="1" tone="brand">▲ 9%</Badge>],
  ['Logistics', '27%', '₦51M', <Badge key="2" tone="teal">▲ 12%</Badge>],
  ['Travel', '9%', '₦18M', <Badge key="3" tone="sky">▲ 6%</Badge>],
  ['Security', '6%', '₦13M', <Badge key="4" tone="slate">▲ 4%</Badge>],
  ['Aviation (beta)', '<1%', '₦4M', <Badge key="5" tone="gold">flagged off</Badge>],
];

const QUEUES = [
  ['KYC verifications', '38', 'SLA 48h · 34 within', <Badge key="a" tone="brand">Healthy</Badge>],
  ['Vendor reviews', '12', '2 security providers (5-layer)', <Badge key="b" tone="brand">Healthy</Badge>],
  ['Disputes', '9', '2 approaching 72h SLA', <Badge key="c" tone="warning">Watch</Badge>],
  ['Fraud alerts', '5', '1 device-cluster case open', <Badge key="d" tone="danger">Action</Badge>],
  ['Payout runs', 'Next 14:30', '₦980k queued · 122 beneficiaries', <Badge key="e" tone="brand">On schedule</Badge>],
];

const LEDGER = [
  ['je_84120', 'escrow.release · bkg_99120', '₦38,000', 'D escrow / C vendor + commission + VAT', <Badge key="1" tone="brand">Posted</Badge>],
  ['je_84119', 'escrow.fund · bkg_99124', '₦15,500', 'D psp_clearing / C escrow', <Badge key="2" tone="brand">Posted</Badge>],
  ['je_84118', 'payout · batch_0412', '₦2.1M', 'D vendor ×122 / C payouts_clearing', <Badge key="3" tone="brand">Posted</Badge>],
  ['je_84117', 'escrow.refund · bkg_99088', '₦7,200', 'D escrow / C psp_clearing', <Badge key="4" tone="brand">Posted</Badge>],
];

export default function AdminPage() {
  return (
    <PortalShell
      title="Admin Control Center"
      subtitle="Nigeria · all cities"
      role="Super admin"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="GMV today" value="₦182M" delta="+9%" />
        <StatCard label="Bookings" value="41,203" delta="+6%" sub="3,412 live 🟢" />
        <StatCard label="Match p95" value="58s" sub="target ≤ 60s" />
        <StatCard label="Fraud loss" value="0.31%" sub="of GMV · target <0.4%" />
        <StatCard label="Escrow float" value="₦412M" sub="held & protected 🔒" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-base font-bold text-slate-900">GMV by vertical (today)</h2>
          <DataTable headers={['Vertical', 'Share', 'GMV', 'Trend']} rows={VERTICALS} />
        </div>
        <div>
          <h2 className="mb-3 font-display text-base font-bold text-slate-900">Operations queues</h2>
          <DataTable headers={['Queue', 'Count', 'Detail', 'Health']} rows={QUEUES} />
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-slate-900">Ledger of record — latest journal entries</h2>
          <Badge tone="brand">Every entry balances · hash-chained audit ✓</Badge>
        </div>
        <DataTable headers={['Entry', 'Source', 'Amount', 'Lines (D / C)', 'Status']} rows={LEDGER} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          ['Lagos', '🟢', 'match 52s p95 · 21k bookings'],
          ['Abuja', '🟢', 'match 61s p95 · 8.1k bookings'],
          ['Kano', '🟡', 'match 71s p95 · supply incentive active'],
        ].map(([city, dot, note]) => (
          <div key={city} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="text-xl">{dot}</span>
            <div>
              <p className="font-semibold text-slate-800">{city}</p>
              <p className="text-xs text-slate-500">{note}</p>
            </div>
          </div>
        ))}
      </div>
    </PortalShell>
  );
}
