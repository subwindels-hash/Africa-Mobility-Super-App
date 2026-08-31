import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA Vendor Console' };

const NAV = [
  { label: 'Home', icon: '▤', active: true },
  { label: 'Requests', icon: '🚚' },
  { label: 'Fleet & Assets', icon: '🚗' },
  { label: 'Staff', icon: '👥' },
  { label: 'Pricing', icon: '₵' },
  { label: 'Availability', icon: '📅' },
  { label: 'Earnings & Payouts', icon: '💰' },
  { label: 'Subscription', icon: '⭐' },
  { label: 'Documents', icon: '🛡' },
  { label: 'Analytics', icon: '📊' },
  { label: 'Chats', icon: '💬' },
];

const REQUESTS = [
  ['⚡ RIDE', 'Victoria Island → Ikeja', '₦15,500', 'Premium · 8.2km', <Badge key="a" tone="brand">Accept</Badge>],
  ['⚡ SEND', 'Yaba → VI (document)', '₦3,200', 'Dispatch · 6.1km', <Badge key="b" tone="teal">Accept</Badge>],
  ['🕐 SCHED', 'Airport transfer 04:00', '₦38,000', 'SUV · Murtala Muhammed T2', <Badge key="c" tone="slate">Assign</Badge>],
  ['📄 RFQ', 'Event transport · 200 pax', '₦800k–1.2M', 'Corporate · 4× SUV needed', <Badge key="d" tone="gold">Quote</Badge>],
];

const FLEET = [
  ['Toyota Camry · ABC-123-XY', 'Sedan · Premium', <Badge key="1" tone="brand">Active 🟢</Badge>, '★ 4.9', 'Insurance ✓ 12/2026'],
  ['Toyota Sienna · LAG-88-JK', 'SUV · VIP', <Badge key="2" tone="brand">Active 🟢</Badge>, '★ 4.8', 'Insurance ✓ 08/2027'],
  ['Honda CB · KJA-21-OP', 'Dispatch bike', <Badge key="3" tone="warning">Docs due 🟡</Badge>, '★ 4.7', 'Roadworthiness ⚠ 09/2026'],
  ['Mercedes E-Class · EKO-55-QW', 'Executive · Chauffeur', <Badge key="4" tone="brand">In trip 🟢</Badge>, '★ 5.0', 'Insurance ✓ 03/2027'],
];

export default function VendorConsolePage() {
  return (
    <PortalShell
      title="Vendor Console"
      subtitle="Chidi Motors & Logistics · Lagos"
      role="Vendor owner"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Requests today" value="38" delta="+12%" sub="vs yesterday" />
        <StatCard label="Active jobs" value="12" sub="4 rides · 8 deliveries" />
        <StatCard label="Revenue today" value="₦412k" delta="+8%" sub="after 12% commission" />
        <StatCard label="Rating" value="★ 4.86" sub="top 10% of Lagos vendors" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <h2 className="mb-3 font-display text-base font-bold text-slate-900">Live request queue</h2>
          <DataTable
            headers={['Type', 'Route / job', 'Fare', 'Details', 'Action']}
            rows={REQUESTS}
          />
        </div>
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-display text-sm font-bold text-slate-900">Coverage & demand</h3>
            <div className="mt-4 grid h-40 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-teal-50 text-sm text-slate-500">
              ▓▓ live demand heatmap (Google Maps) ▓▓
            </div>
            <p className="mt-3 text-xs text-slate-500">Fleet status: ● 12 active · ● 1 in-trip · 1 maintenance</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-display text-sm font-bold text-slate-900">Next payout</h3>
            <p className="mt-2 font-display text-2xl font-bold text-brand-600">₦980,000</p>
            <p className="text-xs text-slate-500">Same-day · GTB ••8842 · 14:30 run</p>
            <div className="mt-3"><Badge tone="brand">Professional plan ✓</Badge></div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-base font-bold text-slate-900">Fleet & assets</h2>
        <DataTable headers={['Asset', 'Class', 'Status', 'Rating', 'Compliance']} rows={FLEET} />
      </div>
    </PortalShell>
  );
}
