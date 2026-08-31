import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · Interstate Logistics Command' };

const NAV = [
  { label: 'Live shipments', icon: '📦', active: true },
  { label: 'Corridors', icon: '🛣' },
  { label: 'Vendors', icon: '🏢' },
  { label: 'Fleet', icon: '🚛' },
  { label: 'Corporate', icon: '👔' },
  { label: 'Cargo security', icon: '🔐' },
  { label: 'Analytics', icon: '📊' },
];

export default function InterstateLogisticsPage() {
  return (
    <PortalShell
      title="Interstate Logistics Command"
      subtitle="Nationwide long-distance freight marketplace — the platform owns no trucks; verified logistics partners carry every load. FAMS-gated at feature, state, route, cargo, vehicle and vendor level"
      role="Logistics operations + super admin (activation & compliance)"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active shipments" value="1,268" sub="across 34 corridors" />
        <StatCard label="Verified vendors" value="212" delta="+14" sub="7-step chain complete" />
        <StatCard label="Fleet utilization" value="81%" delta="+6%" sub="14 vehicle categories" />
        <StatCard label="On-time delivery" value="94.2%" delta="+1.8%" sub="rolling 30 days" />
        <StatCard label="Interstate revenue" value="₦412M" sub="commission ₦49.4M" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">📦 Live shipments — Lagos → Kano corridor</h3>
          <div className="mt-4">
            <DataTable
              headers={['Shipment', 'Cargo · Vehicle', 'Vendor', 'Status']}
              rows={[
                ['SHP-1042', '20t cement · flatbed', 'Bolt Haul Nigeria', <Badge key="1" tone="brand">in transit — Kaduna</Badge>],
                ['SHP-1043', 'reefer pharma · refrigerated', 'ColdExpress Freight', <Badge key="2" tone="brand">cargo loaded</Badge>],
                ['SHP-1044', '40ft container · container truck', 'Dangote Logistics', <Badge key="3" tone="sky">awaiting pickup</Badge>],
                ['SHP-1045', 'livestock (permit ✓ Kano)', 'Kano Haulage Ltd', <Badge key="4" tone="warning">permit check</Badge>],
                ['SHP-1046', 'excavator · low loader', 'HeavyLift NG', <Badge key="5" tone="danger">geofence alert</Badge>],
                ['SHP-1047', 'FMCG LTL · box truck', 'Distribution Co', <Badge key="6" tone="brand">delivered</Badge>],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">Every load: GPS · checkpoints · ETA replay · tamper seals · geofence · proof-of-pickup/delivery with digital signatures &amp; photos.</p>
        </section>

        <div className="grid gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">🛣 Corridor control &amp; routing factors</h3>
            <div className="mt-4">
              <DataTable
                headers={['Corridor', 'Distance · Transit', 'Control']}
                rows={[
                  ['Lagos → Kano (A2)', '570 km · 11.5h', <Badge key="c1" tone="brand">ON</Badge>],
                  ['Lagos → Abuja', '720 km · 13h', <Badge key="c2" tone="brand">ON</Badge>],
                  ['Lagos → Port Harcourt', '600 km · 10.5h', <Badge key="c3" tone="brand">ON</Badge>],
                  ['Kano → Borno', '520 km · 9h', <Badge key="c4" tone="warning">security advisory</Badge>],
                  ['Cross-border (future)', 'GH/KE/ZA corridors', <Badge key="c5" tone="danger">OFF — future phase</Badge>],
                ]}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">AI weighs distance · traffic · road quality · weather · security · vehicle &amp; weight restrictions · tolls · fuel efficiency · deadlines before recommending route + vehicle + provider + cost + ETA.</p>
          </section>

          <section className="rounded-2xl border border-slate-900 bg-slate-900 p-5 text-slate-100 shadow-sm">
            <h3 className="font-semibold text-white">🔐 Vendor verification — 7-step chain</h3>
            <ol className="mt-3 grid grid-cols-1 gap-1.5 text-xs text-slate-300 sm:grid-cols-2">
              <li>1 · Business verification</li>
              <li>2 · Identity verification</li>
              <li>3 · Tax verification</li>
              <li>4 · Insurance verification</li>
              <li>5 · Vehicle verification</li>
              <li>6 · Driver verification</li>
              <li className="font-semibold text-white">7 · Compliance approval (admin)</li>
              <li className="text-emerald-400">→ marketplace activation</li>
            </ol>
            <div className="mt-3 rounded-xl border border-slate-700 bg-black/30 p-3 font-mono text-[11px] text-slate-300">
              POST /v1/interstate/quote &#123; &quot;service&quot;:&quot;cold_chain&quot;, &quot;cargo&quot;:&#123;&quot;categories&quot;:[&quot;cold_chain&quot;],&quot;weightKg&quot;:2000&#125;, &quot;originState&quot;:&quot;NG-LAG&quot;, &quot;destinationState&quot;:&quot;NG-FCT&quot; &#125; → compared verified providers
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="font-semibold text-slate-900">📊 Freight analytics</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Shipment volume" value="3,412" delta="+11%" sub="this month" />
            <StatCard label="Delivery success" value="96.1%" sub="disputes 0.9%" />
            <StatCard label="Avg delivery time" value="13.4h" sub="per corridor" />
            <StatCard label="Customer rating" value="4.7 / 5" sub="post-delivery" />
          </div>
          <div className="mt-4">
            <DataTable
              headers={['Vendor', 'Shipments', 'On-time', 'Rating']}
              rows={[
                ['ColdExpress Freight', '412', '98%', <Badge key="v1" tone="brand">4.9</Badge>],
                ['Bolt Haul Nigeria', '1,105', '96%', <Badge key="v2" tone="brand">4.8</Badge>],
                ['Dangote Logistics', '938', '93%', <Badge key="v3" tone="sky">4.6</Badge>],
                ['HeavyLift NG', '187', '91%', <Badge key="v4" tone="sky">4.4</Badge>],
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Feature activation (FAMS)</h3>
          <div className="mt-4">
            <DataTable
              headers={['Feature', 'State']}
              rows={[
                ['Interstate Logistics', <Badge key="f1" tone="brand">ON — nationwide</Badge>],
                ['Cold Chain', <Badge key="f2" tone="brand">ON</Badge>],
                ['Corporate Logistics', <Badge key="f3" tone="brand">ON</Badge>],
                ['Permitted cargo (livestock)', <Badge key="f4" tone="warning">Kano &amp; Kaduna only</Badge>],
                ['Tanker (fuel/chemicals)', <Badge key="f5" tone="danger">OFF — HSE review</Badge>],
                ['Cross-Border Logistics', <Badge key="f6" tone="danger">OFF — future</Badge>],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">States, routes, cargo categories, vehicle types and individual vendors toggle live through FAMS — no source-code changes, no redeploy.</p>
        </section>
      </div>
    </PortalShell>
  );
}
