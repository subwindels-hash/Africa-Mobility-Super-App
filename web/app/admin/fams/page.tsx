import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · FAMS — Feature Activation Management' };

const NAV = [
  { label: 'Service control center', icon: '🧩', active: true },
  { label: 'Country management', icon: '🌍' },
  { label: 'State management', icon: '🗺' },
  { label: 'City management', icon: '🏙' },
  { label: 'Vendor management', icon: '🏢' },
  { label: 'Asset management', icon: '🚁' },
  { label: 'Feature flags', icon: '🎏' },
  { label: 'Rollout management', icon: '🚀' },
  { label: 'Emergency shutdown', icon: '🛑' },
  { label: 'Activation analytics', icon: '📈' },
];

const ON = (k: string) => <Badge key={k} tone="brand">on</Badge>;
const OFF = (k: string, why: string) => <Badge key={k} tone="danger">{`off · ${why}`}</Badge>;
const MAINT = (k: string) => <Badge key={k} tone="warning">maintenance</Badge>;
const BETA = (k: string) => <Badge key={k} tone="gold">beta</Badge>;
const HIDDEN = (k: string) => <Badge key={k} tone="slate">hidden</Badge>;

export default function FamsAdminPage() {
  return (
    <PortalShell
      title="FAMS — Feature Activation Management System"
      subtitle="Activate, deactivate, hide, schedule or gradually roll out any service, location, category, feature, vendor or asset — no software update, no code change"
      role="Super admin (RBAC + MFA + audit trail)"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active phase" value="Phase 4 / 5" sub="marine unlocks at Phase 5" />
        <StatCard label="Global switches" value="25 / 25" sub="23 on · marine + tourism off" />
        <StatCard label="Activation rules" value="41" delta="+6 today" sub="every change logged" />
        <StatCard label="Emergency stops" value="0" sub="11 kill domains armed" />
        <StatCard label="Blocked requests (24h)" value="128" sub="canonical message served" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🧩 Service control center — global switches (24)</h3>
          <p className="mt-1 text-sm text-slate-500">Everything is built from day one; visibility is decided here per module.</p>
          <div className="mt-4">
            <DataTable
              headers={['Module', 'Global', 'Note']}
              rows={[
                ['🚗 Transportation', ON('t'), 'Phase 1 — always-on core'],
                ['🚕 Taxi services', ON('taxi'), 'Phase 1'],
                ['🛵 Dispatch services', ON('dsp'), 'Phase 1'],
                ['📦 Logistics', ON('l'), 'Phase 1'],
                ['📮 Delivery', ON('dl'), 'Phase 1'],
                ['✈️ Travel', ON('tr'), 'GDS: Amadeus + Sabre'],
                ['🛫 Flights', ON('fl'), 'domestic + international'],
                ['🏨 Hotels', ON('h'), 'Phase 2'],
                ['🏡 Accommodation', ON('ac'), 'short-lets + vacation'],
                ['🛠 Roadside assistance', ON('r'), 'Phase 2'],
                ['🛡 Security marketplace', ON('s'), 'Phase 3'],
                ['🚁 Aviation', ON('av'), 'Phase 4 — heli/jet/charter/air-amb'],
                ['⚓ Marine services', OFF('m', 'phase 5'), 'built, hidden until launch'],
                ['🏢 Corporate services', ON('c'), 'Phase 2'],
                ['👛 Wallet', ON('w'), 'KYC-gated'],
                ['🔒 Escrow', ON('e'), 'platform-hold model'],
                ['🏅 Loyalty program', ON('ly'), '5 tiers'],
                ['🗂 Subscription plans', ON('vs'), '4 vendor tiers'],
                ['🎁 Promotions', ON('pr'), 'time-windowed'],
                ['🤖 WhatsApp AI assistant', ON('wa'), 'Ada — obeys FAMS'],
                ['🧠 AI features', ON('ai'), 'recommendations, search, pricing'],
                ['📹 Video calls', ON('v'), 'WebRTC'],
                ['📞 Voice calls', ON('vc'), 'WebRTC + PSTN fallback'],
                ['💬 Chat system', ON('ch'), 'in-app + in-ride'],
                ['🖼 Tourism services', OFF('tou', 'awaiting activation'), 'built — one switch to launch'],
              ]}
            />
          </div>
        </section>

        <div className="grid gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">🌍 Country · 🗺 state · 🏙 city management</h3>
            <div className="mt-4">
              <DataTable
                headers={['Scope', 'Service', 'Value']}
                rows={[
                  ['🇳🇬 Nigeria', 'all services', ON('ng')],
                  ['🇬🇭 Ghana', 'travel', OFF('gh1', 'GDS contracts')],
                  ['🇬🇭 Ghana', 'security', OFF('gh2', 'licensing')],
                  ['🇰🇪 Kenya', 'transportation + logistics', OFF('ke', 'launch pending')],
                  ['NG-ED (Edo) · state', 'travel', OFF('ed1', 'OTA licensing')],
                  ['NG-ED (Edo) · state', 'aviation', OFF('ed2', 'airspace clearance')],
                  ['NG-BNI (Benin City) · city', 'security', OFF('bni', 'licensing')],
                  ['NG-ASB (Asaba) · city', 'aviation', OFF('asb', 'airspace approval')],
                  ['🛰 Geofence', 'airport transfer', <Badge key="geo" tone="sky">MMIA 15 km only</Badge>],
                ]}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">City ON overrides state OFF; state ON overrides country OFF — precedence asset &gt; vendor &gt; category &gt; city &gt; state &gt; country &gt; global.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">🧾 Service category switches (independent)</h3>
            <div className="mt-4 grid gap-4">
              <DataTable
                headers={['Family', 'Categories', 'State']}
                rows={[
                  ['Transportation', 'economy · standard · premium · VIP taxi · executive chauffeur', <><Badge key="c1" tone="brand">on</Badge> <Badge key="c2" tone="warning">VIP taxi maintenance</Badge></>],
                  ['Dispatch', 'bike dispatch · courier · parcel · document', ON('c3')],
                  ['Travel', 'domestic flights · international flights · hotel booking', ON('c4')],
                  ['Security', 'exec protection · VIP escort · event · corporate · security drivers', ON('c5')],
                  ['Aviation', 'helicopter · private jet · charter · air ambulance', ON('c6')],
                  ['Marine', 'boat charter · yacht charter · water taxi', OFF('c7', 'phase 5')],
                ]}
              />
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🏢 Vendor & asset management</h3>
          <div className="mt-4 grid gap-4">
            <DataTable
              headers={['Vendor', 'Type', 'State']}
              rows={[
                ['vnd_a · Lekki Luxury Chauffeurs', 'Chauffeur fleet', <Badge key="va" tone="brand">Active</Badge>],
                ['vnd_b · Sahara Escorts', 'Security provider', <Badge key="vb" tone="danger">Suspended</Badge>],
                ['vnd_c · NigerJet Charters', 'Aviation operator', MAINT('vc')],
                ['vnd_d · Asaba Fleet', 'Intercity taxi', <Badge key="vd" tone="sky">Pending review</Badge>],
                ['vnd_e · Kano executive cars', 'VIP taxi', <Badge key="ve" tone="slate">Disabled</Badge>],
              ]}
            />
            <DataTable
              headers={['Asset', 'Class', 'Value']}
              rows={[
                ['ast_jet_b · Falcon 8X', 'private jet', OFF('jb', 'cert renewal')],
                ['ast_heli_7 · AW139', 'helicopter', ON('h7')],
                ['class: dispatch bikes', 'dispatch bike', ON('db')],
                ['ast_charter_2 · King Air 350', 'charter aircraft', ON('ca')],
                ['ast_yacht_1 · LagFerry VIP', 'yacht', HIDDEN('y1')],
                ['ast_boat_2 · water taxi 12', 'boat', HIDDEN('b2')],
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🎏 Feature flags</h3>
          <div className="mt-4">
            <DataTable
              headers={['Flag', 'Scope', 'Value']}
              rows={[
                ['WhatsApp AI assistant', 'global', ON('fd2')],
                ['AI dynamic pricing', 'NG · beta+vip · 25%', BETA('fd1')],
                ['Video calling', 'global · beta', BETA('fd3')],
                ['Live tracking', 'global', ON('fd9')],
                ['Corporate portal', 'corporate clients', ON('fd10')],
                ['Wallet', 'global', ON('fd4')],
                ['Escrow', 'global', ON('fd5')],
                ['Next-gen assistant', 'beta testers + VIP', BETA('fd6')],
                ['ride.vip category', 'fleet maintenance window', MAINT('fd7')],
                ['Airport transfer', 'geofence: MMIA 15 km', <Badge key="fd8" tone="sky">inside fence only</Badge>],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">Flag changes take effect on the next request — no app release, no backend restart.</p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🚀 Rollout management — phased launch</h3>
          <div className="mt-4">
            <DataTable
              headers={['Phase', 'Enables', 'Status']}
              rows={[
                ['Phase 1', 'taxi · dispatch · logistics · wallet · escrow · WhatsApp AI', <Badge key="p1" tone="brand">live</Badge>],
                ['Phase 2', 'travel · flights · hotels · accommodation · corporate · roadside', <Badge key="p2" tone="brand">live</Badge>],
                ['Phase 3', 'security marketplace · exec protection · VIP escort · security drivers', <Badge key="p3" tone="brand">live</Badge>],
                ['Phase 4', 'aviation · helicopter · private jet · charter · air ambulance', <Badge key="p4" tone="sky">active</Badge>],
                ['Phase 5', 'marine · boat charter · yacht charter · water taxi', <Badge key="p5" tone="slate">planned</Badge>],
              ]}
            />
          </div>
          <div className="mt-4">
            <DataTable
              headers={['Rollout', 'Audience (7 groups)', 'Window']}
              rows={[
                ['promo.ride20', 'customers · NG', '01 Nov 2026 → 31 Jan 2027'],
                ['ai.assistant_next_gen', 'beta testers + VIP customers', '—'],
                ['portal.corp_pilot', 'corporate clients only', 'pilot'],
                ['Escrow protection', 'customers + vendors · 100%', 'since Phase 1'],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">User groups: customers · drivers · riders · vendors · corporate clients · beta testers · VIP customers.</p>
        </section>

        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5 shadow-sm">
          <h3 className="font-semibold text-red-900">🛑 Emergency shutdown (kill switch)</h3>
          <p className="mt-1 text-sm text-red-700/80">One switch per domain. Overrides every rule above — effective instantly, no deploy.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {['Transportation', 'Dispatch', 'Logistics', 'Travel', 'Security', 'Aviation', 'Marine', 'Payments', 'Wallet', 'Escrow', 'WhatsApp AI'].map((d) => (
              <div key={d} className="flex items-center justify-between rounded-xl border border-red-200 bg-white px-4 py-3">
                <span className="text-sm font-medium text-slate-800">{d}</span>
                <span className="inline-flex h-6 w-11 items-center rounded-full border border-slate-300 bg-slate-100 px-1 text-[10px] font-bold text-slate-500">ARMED</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-red-300 bg-white p-4 font-mono text-xs text-slate-700">
            POST /v1/fams/emergency &#123; &quot;target&quot;: &quot;vertical:transportation&quot;, &quot;on&quot;: true, &quot;reason&quot;: &quot;…&quot; &#125; → 403 &quot;Service is currently unavailable in your location.&quot;
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">📈 Activation analytics</h3>
        <p className="mt-1 text-sm text-slate-500">Live coverage per city (GET /v1/fams/analytics) and rule distribution across scopes.</p>
        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          <DataTable
            headers={['City', 'Verticals live', 'Coverage']}
            rows={[
              ['Lagos (NG-LAG)', '8 / 8', <Badge key="a1" tone="brand">full</Badge>],
              ['Abuja (NG-ABJ)', '8 / 8', <Badge key="a2" tone="brand">full</Badge>],
              ['Port Harcourt (NG-PHC)', '8 / 8', <Badge key="a3" tone="brand">full</Badge>],
              ['Benin City (NG-BNI)', '6 / 8', <Badge key="a4" tone="warning">security, travel off</Badge>],
              ['Asaba (NG-ASB)', '7 / 8', <Badge key="a5" tone="warning">aviation off</Badge>],
              ['Kano (NG-KAN)', '8 / 8', <Badge key="a6" tone="brand">full</Badge>],
            ]}
          />
          <DataTable
            headers={['Scope', 'Rules', 'Share']}
            rows={[
              ['global (modules & flags)', '18', '44%'],
              ['country', '4', '10%'],
              ['state', '2', '5%'],
              ['city', '2', '5%'],
              ['category', '3', '7%'],
              ['vendor', '3', '7%'],
              ['asset', '2', '5%'],
              ['user-group scoped', '4', '10%'],
            ]}
          />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-900 p-5 text-slate-100 shadow-sm">
        <h3 className="font-semibold text-white">Request pipeline — every request passes the activation engine</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
          {['User request', 'Location validation', 'Country validation', 'State validation', 'City validation', 'Feature flag validation', 'Vendor validation', 'Booking engine'].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-full bg-slate-800 px-3 py-1.5 ring-1 ring-slate-700">{s}</span>
              {i < 7 && <span className="text-slate-500">→</span>}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">When a gate is OFF the chain stops before pricing, dispatch or escrow and the customer sees exactly: &quot;Service is currently unavailable in your location.&quot; — the WhatsApp AI assistant, recommendation, search, pricing and support engines obey the same rules (no helicopter recommendations where aviation is off, no hotel options where hotels are off).</p>
      </section>
    </PortalShell>
  );
}
