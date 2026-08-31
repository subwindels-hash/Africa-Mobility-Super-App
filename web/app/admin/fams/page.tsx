import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · FAMS — Feature Activation Management' };

const NAV = [
  { label: 'Service control', icon: '🧩', active: true },
  { label: 'Country', icon: '🌍' },
  { label: 'State', icon: '🗺' },
  { label: 'City', icon: '🏙' },
  { label: 'Vendor', icon: '🏢' },
  { label: 'Asset', icon: '🚁' },
  { label: 'Feature flags', icon: '🎏' },
  { label: 'Rollout management', icon: '🚀' },
  { label: 'Emergency shutdown', icon: '🛑' },
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
      subtitle="Activate, deactivate, hide or gradually roll out any service, location, feature, vendor or asset — no software update, no code change"
      role="Super admin (RBAC + MFA + audit trail)"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active phase" value="Phase 4 / 5" sub="marine next at Phase 5" />
        <StatCard label="Services ON" value="26 / 31" sub="18 modules · 8 verticals · 5 features" />
        <StatCard label="Activation rules" value="24" delta="+3 today" sub="every change audited" />
        <StatCard label="Emergency stops" value="0" sub="kill switch ready — no deploy" />
        <StatCard label="Scheduled activations" value="3" sub="next: GH flights · 01 Jan 2027" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🧩 Service control — global (18 modules)</h3>
          <p className="mt-1 text-sm text-slate-500">Everything is built from day one; visibility is decided here per module.</p>
          <div className="mt-4">
            <DataTable
              headers={['Module', 'Global', 'Note']}
              rows={[
                ['🚗 Transportation', ON('t'), 'Phase 1 — always-on core'],
                ['📦 Logistics & dispatch', ON('l'), 'Phase 1'],
                ['✈️ Travel (flights)', ON('tr'), 'GDS: Amadeus + Sabre'],
                ['🚁 Private aviation', ON('av'), 'Heli / jet / charter / air-amb'],
                ['🛡 Security services', ON('s'), 'Escorts, convoy, residence'],
                ['🏨 Accommodation', ON('h'), 'Hotels + short-lets'],
                ['🛠 Roadside assistance', ON('r'), 'Phase 3'],
                ['🏢 Corporate services', ON('c'), 'Phase 3'],
                ['⚓ Marine / boats', OFF('m', 'phase 5'), 'Built, hidden until launch'],
                ['💳 Payments', ON('p'), 'Paystack · Flutterwave · Monnify'],
                ['👛 Wallet', ON('w'), 'KYC-gated'],
                ['🔒 Escrow', ON('e'), 'Platform-hold model'],
                ['🤖 WhatsApp AI (Ada)', ON('wa'), 'Docs 26 platform'],
                ['📈 AI dynamic pricing', BETA('ai'), '25% · NG · beta+vip'],
                ['📹 Video calling', BETA('v'), 'WebRTC in-app + in-ride'],
                ['🏅 Loyalty programme', ON('ly'), '5 tiers'],
                ['🗂 Vendor subscriptions', ON('vs'), '4 tiers'],
                ['🎁 Promotions', ON('pr'), 'time-windowed'],
              ]}
            />
          </div>
        </section>

        <div className="grid gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">🌍 Country control</h3>
            <div className="mt-4">
              <DataTable
                headers={['Country', 'Services', 'Effect']}
                rows={[
                  ['🇳🇬 Nigeria (NG)', <span key="ng">all verticals</span>, ON('ng')],
                  ['🇰🇪 Kenya (KE)', <span key="ke">transportation, logistics</span>, OFF('ke', 'launch pending')],
                  ['🇬🇭 Ghana (GH)', <span key="gh">security services</span>, OFF('gh', 'licensing')],
                  ['🇬🇭 Ghana (GH)', <span key="gh2">travel — scheduled</span>, <Badge key="gh3" tone="sky">activates 01 Jan 2027</Badge>],
                ]}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">🗺 State & 🏙 city control</h3>
            <div className="mt-4">
              <DataTable
                headers={['Scope', 'Service', 'Value']}
                rows={[
                  ['NG-ED (Edo) · state', 'Aviation', OFF('ed', 'airspace clearance')],
                  ['NG-DE (Delta) · state', 'Aviation', OFF('de', 'airspace clearance')],
                  ['NG-ASB (Asaba) · city', 'Aviation', OFF('asb', 'pending approval')],
                  ['NG-KAN (Kano) · city', 'Security', ON('kan')],
                  ['🛰 Geofence', 'Airport transfer', <Badge key="geo" tone="sky">MMIA 15 km only</Badge>],
                ]}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">City ON overrides state OFF; state ON overrides country OFF — precedence asset &gt; vendor &gt; category &gt; city &gt; state &gt; country &gt; global.</p>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🏢 Vendor & asset control</h3>
          <div className="mt-4 grid gap-4">
            <DataTable
              headers={['Vendor', 'Type', 'State']}
              rows={[
                ['vnd_a · Lekki Luxury Chauffeurs', 'Chauffeur fleet', <Badge key="va" tone="brand">Active</Badge>],
                ['vnd_b · Sahara Escorts', 'Security provider', <Badge key="vb" tone="danger">Suspended</Badge>],
                ['vnd_c · NigerJet Charters', 'Aviation operator', MAINT('vc')],
                ['vnd_d · Asaba Fleet', 'Intercity taxi', <Badge key="vd" tone="sky">Pending review</Badge>],
              ]}
            />
            <DataTable
              headers={['Asset', 'Class', 'Value']}
              rows={[
                ['ast_jet_b · Falcon 8X', 'Jet', OFF('jb', 'cert renewal')],
                ['ast_heli_7 · AW139', 'Helicopter', ON('h7')],
                ['ast_boat_2 · LagFerry VIP', 'Boat', HIDDEN('b2')],
                ['Class: motorcycle', 'Dispatch bikes', ON('mc')],
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
                ['AI dynamic pricing', 'NG · beta+vip · 25%', BETA('fd1')],
                ['WhatsApp AI assistant', 'global', ON('fd2')],
                ['Video calling', 'global · beta', BETA('fd3')],
                ['Wallet', 'global', ON('fd4')],
                ['Escrow', 'global', ON('fd5')],
                ['Next-gen assistant', 'user groups: beta, vip', BETA('fd6')],
                ['ride.vip category', 'category · fleet window', MAINT('fd7')],
                ['Airport transfer', 'geofence: MMIA 15 km', <Badge key="fd8" tone="sky">inside fence only</Badge>],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">Flag changes take effect on the next request — no app release, no backend restart.</p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🚀 Rollout management</h3>
          <div className="mt-4">
            <DataTable
              headers={['Phase', 'Unlocks', 'Status']}
              rows={[
                ['Phase 1', 'Transportation · logistics · wallet · escrow · WhatsApp AI', <Badge key="p1" tone="brand">live</Badge>],
                ['Phase 2', 'Travel · aviation · security · accommodation · AI pricing', <Badge key="p2" tone="brand">live</Badge>],
                ['Phase 3', 'Roadside · corporate services', <Badge key="p3" tone="brand">live</Badge>],
                ['Phase 4', 'Marine · Ghana · Kenya (current)', <Badge key="p4" tone="sky">active</Badge>],
                ['Phase 5', 'UAE · UK · USA', <Badge key="p5" tone="slate">planned</Badge>],
              ]}
            />
          </div>
          <div className="mt-4">
            <DataTable
              headers={['Rollout', 'Audience', 'Window']}
              rows={[
                ['promo.ride20', 'customers · NG', '01 Nov 2026 → 31 Jan 2027'],
                ['ai.assistant_next_gen', 'beta + vip groups', '—'],
                ['Escrow protection', 'customers + vendors · 100%', 'since Phase 1'],
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5 shadow-sm">
          <h3 className="font-semibold text-red-900">🛑 Emergency shutdown (kill switch)</h3>
          <p className="mt-1 text-sm text-red-700/80">One switch per domain. Overrides every rule above and returns the canonical message — effective instantly, no deploy.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {['Transportation', 'Logistics', 'Travel', 'Aviation', 'Security', 'Payments', 'Wallet', 'Escrow', 'WhatsApp AI'].map((d) => (
              <div key={d} className="flex items-center justify-between rounded-xl border border-red-200 bg-white px-4 py-3">
                <span className="text-sm font-medium text-slate-800">{d}</span>
                <span className="inline-flex h-6 w-11 items-center rounded-full border border-slate-300 bg-slate-100 px-1 text-[10px] font-bold text-slate-500">ARMED</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-red-300 bg-white p-4 font-mono text-xs text-slate-700">
            POST /v1/fams/emergency &#123; &quot;target&quot;: &quot;vertical:transportation&quot;, &quot;on&quot;: true, &quot;reason&quot;: &quot;…&quot; &#125; → 403 &quot;Service currently unavailable in your location.&quot;
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-900 p-5 text-slate-100 shadow-sm">
        <h3 className="font-semibold text-white">Request pipeline — every request passes the activation engine</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
          {['User request', 'Feature Activation Engine', 'Location validation', 'Feature flag validation', 'Vendor availability', 'Booking engine'].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-full bg-slate-800 px-3 py-1.5 ring-1 ring-slate-700">{s}</span>
              {i < 5 && <span className="text-slate-500">→</span>}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">When a gate is OFF the chain stops before pricing, dispatch or escrow and the customer sees exactly: &quot;Service currently unavailable in your location.&quot; — the WhatsApp AI assistant obeys the same rules (no helicopter recommendations where aviation is off).</p>
      </section>
    </PortalShell>
  );
}
