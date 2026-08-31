import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA Corporate Portal' };

const NAV = [
  { label: 'Overview', icon: '▤', active: true },
  { label: 'Book', icon: '📅' },
  { label: 'Approvals', icon: '✅' },
  { label: 'Employees', icon: '👥' },
  { label: 'Departments', icon: '🏢' },
  { label: 'Budgets', icon: '₵' },
  { label: 'Invoices', icon: '🧾' },
  { label: 'Analytics', icon: '📊' },
];

const SPEND = [
  { dept: 'Trading', used: 82, budget: '₦20M', tone: 'warning' as const },
  { dept: 'Operations', used: 48, budget: '₦15M', tone: 'brand' as const },
  { dept: 'Executive', used: 61, budget: '₦25M', tone: 'brand' as const },
  { dept: 'Technology', used: 33, budget: '₦12M', tone: 'brand' as const },
];

const APPROVALS = [
  ['✈️ Intl flight — Chidi O. (Trading)', '£1,240', 'Exceeds class cap £800', <Badge key="a" tone="danger">Needs approval</Badge>],
  ['🛡 Executive transport — VIP visit', '₦420,000', 'Director sign-off required', <Badge key="b" tone="warning">Escalated</Badge>],
  ['🚗 Weekend fleet · 12 cars', '₦1.18M', '+₦180k over dept budget', <Badge key="c" tone="danger">Needs approval</Badge>],
];

const RECENT = [
  ['BKG-99120', 'Ride · Executive', 'Amaka O.', 'Trading', '₦38,000', <Badge key="1" tone="brand">Settled</Badge>],
  ['BKG-99118', 'Logistics · Courier', 'Emeka N.', 'Operations', '₦12,500', <Badge key="2" tone="brand">Settled</Badge>],
  ['BKG-99114', 'Flight LOS→ABV', 'Zainab M.', 'Executive', '₦78,000', <Badge key="3" tone="brand">Ticketed</Badge>],
  ['BKG-99110', 'Security · Event (12 agents)', 'Facilities', 'Operations', '₦850,000', <Badge key="4" tone="sky">Milestone 2/3</Badge>],
];

export default function CorporatePage() {
  return (
    <PortalShell
      title="Corporate Portal"
      subtitle="Zenith Events PLC · 312 employees · 4 departments"
      role="Corp admin"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="October spend" value="₦42.8M" delta="+15%" sub="of ₦60M budget" />
        <StatCard label="Policy compliance" value="97%" sub="auto-approved bookings" />
        <StatCard label="Open approvals" value="3" sub="SLA 30 min" />
        <StatCard label="Next invoice" value="₦42.8M" sub="01 Nov · VAT & WHT ready" />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-slate-900">Budget pools · October</h2>
          <Badge tone="brand">Alert at 80% of pool</Badge>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {SPEND.map((s) => (
            <div key={s.dept}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">{s.dept}</span>
                <span className="text-slate-500">{s.used}% of {s.budget}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${s.used > 80 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${s.used}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-base font-bold text-slate-900">Approval inbox</h2>
          <DataTable headers={['Request', 'Amount', 'Policy', 'Status']} rows={APPROVALS} />
        </div>
        <div>
          <h2 className="mb-3 font-display text-base font-bold text-slate-900">Recent company bookings</h2>
          <DataTable headers={['ID', 'Service', 'User', 'Dept', 'Amount', 'Status']} rows={RECENT} />
        </div>
      </div>
    </PortalShell>
  );
}
