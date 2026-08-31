import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · Autonomous Mobility Control Center' };

const NAV = [
  { label: 'Live vehicles', icon: '📡', active: true },
  { label: 'Active trips', icon: '🚗' },
  { label: 'Safety alerts', icon: '⚠️' },
  { label: 'Autonomy modes', icon: '🤖' },
  { label: 'Route status', icon: '🛣' },
  { label: 'Fleet intelligence', icon: 'fleet 📊'.replace('fleet ', '') },
  { label: 'Vehicle cybersecurity', icon: '🔐' },
  { label: 'Incident review', icon: '📋' },
];

export default function MobilityControlCenterPage() {
  return (
    <PortalShell
      title="Autonomous Mobility Control Center"
      subtitle="AI vehicle tracking, intelligence, driver assistance and FAMS-gated autonomy across every asset class — human-driven today, autonomous-ready tomorrow"
      role="Super admin (emergency workflows + autonomy disable where legal)"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Vehicles tracked" value="2,847" sub="11 asset classes incl. AVs" />
        <StatCard label="Autonomous vehicles" value="6" sub="all in supervised pilot zone" />
        <StatCard label="Safety alerts (24h)" value="34" sub="2 critical · escalated" />
        <StatCard label="Driver-assist sessions" value="1,204" delta="+9%" sub="voice + dashboard" />
        <StatCard label="Autonomy status" value="Supervised only" sub="self-driving OFF (legal gate)" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">📡 Live vehicles — real-time monitoring</h3>
          <div className="mt-4">
            <DataTable
              headers={['Vehicle', 'Class / Mode', 'Speed · Health', 'Status']}
              rows={[
                ['AV-001', 'autonomous · supervised', '48 km/h · 96%', <Badge key="1" tone="brand">on trip · supervised</Badge>],
                ['AV-002', 'autonomous · supervised', '0 km/h · 91%', <Badge key="2" tone="sky">charging at hub</Badge>],
                ['T-104', 'truck · AI-assisted', '62 km/h · 88%', <Badge key="3" tone="brand">on route (truck route)</Badge>],
                ['B-221', 'delivery bike · manual', '31 km/h · 74%', <Badge key="4" tone="brand">dispatching</Badge>],
                ['C-088', 'car · manual', '0 km/h · 55%', <Badge key="5" tone="warning">maintenance due</Badge>],
                ['AV-003', 'autonomous · requested full', '— · 98%', <Badge key="6" tone="danger">blocked: FAMS self-driving OFF</Badge>],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">Monitored per frame: GPS · speed · direction · route · destination · driver status · vehicle status · engine · fuel/battery · health · maintenance · deviations · unexpected stops · geofence violations.</p>
        </section>

        <div className="grid gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">🤖 Operating modes — FAMS controlled</h3>
            <div className="mt-4">
              <DataTable
                headers={['Mode', 'Description', 'Activation']}
                rows={[
                  ['Manual', 'human drives · optional AI assistance', <Badge key="m1" tone="brand">ON</Badge>],
                  ['AI Assisted', 'AI navigation · traffic · safety alerts · human drives', <Badge key="m2" tone="brand">ON</Badge>],
                  ['Supervised Autonomous', 'AI controls functions · qualified human supervises', <Badge key="m3" tone="sky">pilot zone only</Badge>],
                  ['Full Autonomous', 'AI drives — vehicle + tech + environment + law + safety ALL required', <Badge key="m4" tone="danger">OFF — legal approval</Badge>],
                ]}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">Controls exist per country · state · city · <strong>road zone</strong> · vehicle · <strong>fleet</strong> · vendor · operating mode · autonomous feature.</p>
          </section>

          <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5 shadow-sm">
            <h3 className="font-semibold text-red-900">⚠️ Safety & security events</h3>
            <div className="mt-3 space-y-2 text-sm">
              {[
                ['🚨 AV-001 · passenger emergency', 'workflow triggered · contacts notified · immobilized (legal ✓)'],
                ['📡 C-091 · GPS spoofing signature', 'physically impossible jump — SHIELD contained, driver called'],
                ['🛑 B-204 · malicious command blocked', '“disable_brakes” rejected by auth model → SHIELD threat'],
                ['⚠️ T-104 · harsh-braking strike 3', 'dangerous driving alert · driver coaching queued'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-xl border border-red-200 bg-white px-4 py-2.5">
                  <div className="font-medium text-slate-800">{t}</div>
                  <div className="text-xs text-slate-500">{d}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-red-300 bg-white p-3 font-mono text-[11px] text-slate-700">
              POST /v1/mobility/safety &#123; &quot;type&quot;: &quot;passenger_emergency&quot;, &quot;severity&quot;: 0.95, &quot;legallyPermitted&quot;: true &#125; → emergency workflow + safe stop
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="font-semibold text-slate-900">🛣 Vehicle-class-aware route intelligence</h3>
          <div className="mt-4">
            <DataTable
              headers={['Vehicle', 'Recommended route', 'Why (multi-factor)']}
              rows={[
                ['🏍 B-221 (bike)', 'Inner streets — 14 km · 30 min', 'bike lanes + narrow roads allowed · instant dispatch'],
                ['🚚 T-104 (truck)', 'Truck bypass — 24 km · 34 min', 'heavy trucks restricted to truck routes · 3.0t load'],
                ['🤖 AV-001 (autonomous)', 'AV corridor (Eko Atlantic) — 20 km · 28 min', 'AV-mapped corridor — autonomy permitted'],
                ['🚕 C-077 (taxi)', 'Third Mainland Bridge — 18 km · 26 min', 'fastest · primary roads · passenger comfort'],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">Factors: distance · traffic · road quality · weather · closures · security conditions · vehicle type · capacity · delivery requirements · passenger requirements.</p>
        </section>

        <section className="rounded-2xl border border-slate-900 bg-slate-900 p-5 text-slate-100 shadow-sm">
          <h3 className="font-semibold text-white">🔐 Vehicle cybersecurity + safety-first autonomy</h3>
          <ul className="mt-3 space-y-2 text-xs text-slate-300">
            <li>• mTLS per-vehicle certificates — no anonymous commands</li>
            <li>• Capability-scoped authorization · signed, replay-protected commands</li>
            <li>• GPS spoofing · unauthorized access · sensor manipulation · identity fraud → SHIELD swarm</li>
            <li>• Sensor fusion required: ≥2 live sources corroborating — never maps alone</li>
            <li>• Fusion confidence drops → mode DOWNGRADES to human control</li>
            <li>• Safety priority: human → regulatory → vehicle → passenger → emergency</li>
            <li>• All autonomy legally approved, tested &amp; certified before activation</li>
          </ul>
        </section>
      </div>
    </PortalShell>
  );
}
