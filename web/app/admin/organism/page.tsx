import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · ORGANISM — Global AI Organism' };

const NAV = [
  { label: 'Cognitive state', icon: '🧠', active: true },
  { label: 'Agent layers', icon: '🐝' },
  { label: 'Intelligence graph', icon: '🕸' },
  { label: 'Executive board', icon: '👑' },
  { label: 'Decisions', icon: '⚖' },
  { label: 'Execution', icon: '⚙️' },
  { label: 'Evolution', icon: '🧬' },
  { label: 'Pulse history', icon: '💓' },
];

export default function OrganismPage() {
  return (
    <PortalShell
      title="ORGANISM — Global AI Organism Architecture"
      subtitle="A single distributed cognitive enterprise organism — 8 layers, 120,000+ agents, autonomous decision-making, self-healing and continuous evolution"
      role="Super admin (humans set guardrails — the organism runs the loop)"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total agents" value="121,000" sub="8 layers · 43 sub-swarms" />
        <StatCard label="Pulses today" value="1,440" sub="one full cycle / minute" />
        <StatCard label="Executive decisions" value="212" delta="+18" sub="Data-Governance validated" />
        <StatCard label="Tasks executed" value="1,847" sub="98.9% succeeded autonomously" />
        <StatCard label="Evolution steps" value="64 adopted" sub="thresholds self-tuned" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🐝 The eight layers (canonical fleet)</h3>
          <div className="mt-4">
            <DataTable
              headers={['Layer', 'Agents', 'Sub-swarms', 'Function']}
              rows={[
                ['📊 Data Analysis', '60,000', '6 × 10,000', 'core data · BI · predictive · security data · product intel · AI optimization'],
                ['👑 Executive Support', '10,000', '8 clusters', 'CEO 2,000 · CFO/COO/CTO 1,500 · CISO/CMO/CHRO 1,000 · Data Gov 1,500'],
                ['🛡️ Cybersecurity (SHIELD)', '10,000', '6 families', 'network · app · infra · identity 2,000 each · data · threat intel 1,000'],
                ['🏗️ Operations & Infra', '15,000', '5 groups', 'cloud 4,000 · load-bal/DevOps/API 3,000 · database 2,000'],
                ['⚙️ Automation & Execution', '10,000', '5 groups', 'workflow 3,000 · comms/task/microservice 2,000 · BPA 1,000'],
                ['📱 Product & User Intel', '5,000', '5 groups', 'journeys 1,500 · adoption/UX-sim/retention 1,000 · interface 500'],
                ['🎼 Orchestration', '5,000', '4 groups', 'coordination 2,000 · routing · load-balance · conflict 1,000'],
                ['🧬 Intelligence Evolution', '5,000', '4 groups', 'meta-learning 2,000 · self-improvement · simulation · evolution modeling'],
              ]}
            />
          </div>
        </section>

        <div className="grid gap-6">
          <section className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-slate-100 shadow-sm">
            <h3 className="font-semibold text-white">💓 Full-system intelligence flow (every pulse)</h3>
            <div className="mt-3 space-y-2 text-xs font-medium">
              {[
                '1 · Data generated across all modules (bookings, payments, trips, threats, telemetry)',
                '2 · Data Analysis Swarm (60,000) derives intelligence → shared intelligence graph',
                '3 · Executive Layer deliberates → prioritized, governance-validated decisions',
                '4 · Orchestration Layer distributes tasks & resolves conflicts',
                '5 · Execution Layer performs actions autonomously',
                '6 · Security (SHIELD) & Infrastructure ensure stability in parallel',
                '7 · Evolution Layer improves the organism — feedback mutates its own tunables',
              ].map((s) => (
                <div key={s} className="rounded-lg bg-slate-800 px-3 py-2 ring-1 ring-slate-700">{s}</div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">🕸 Shared intelligence graph</h3>
            <div className="mt-4">
              <DataTable
                headers={['Node', 'Kind', 'Weight', 'Confidence', 'Observations']}
                rows={[
                  ['kpi:demand', 'kpi', '18.4', '0.93', '12,481'],
                  ['threat:platform', 'threat', '15.2', '0.88', '9,032'],
                  ['city:NG-LAG', 'city', '13.9', '0.91', '21,770'],
                  ['kpi:latency', 'kpi', '11.6', '0.87', '8,214'],
                  ['kpi:margin', 'kpi', '9.8', '0.90', '7,905'],
                ]}
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">Every agent contributes; weights decay without signal, confidence is cross-agent agreement.</p>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">👑 Executive board — last deliberation</h3>
          <div className="mt-4">
            <DataTable
              headers={['Cluster', 'Decision', 'Priority', 'Status']}
              rows={[
                ['CEO 👑', 'Strategic focus: scale capacity & rebalance load', 'P1', <Badge key="a" tone="brand">synthesized</Badge>],
                ['CISO 🛡️', 'Elevate security posture to high', 'P2', <Badge key="b" tone="brand">executing</Badge>],
                ['COO ⚙️', 'Scale capacity & rebalance load', 'P2', <Badge key="c" tone="brand">executing</Badge>],
                ['CFO 💰', 'Trim burn & re-allocate budget', 'P3', <Badge key="d" tone="warning">sequenced</Badge>],
                ['CMO 📈', 'Accelerate acquisition while demand is hot', 'P4', <Badge key="e" tone="sky">queued</Badge>],
                ['Data Gov 📊', 'Validation — cost/growth tension flagged', '—', <Badge key="f" tone="brand">validated</Badge>],
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🧬 Evolution loop — what the organism learned</h3>
          <div className="mt-4">
            <DataTable
              headers={['Experiment', 'Change', 'Status']}
              rows={[
                ['self_improvement', 'latencyThreshold 800ms → 680ms (react earlier)', <Badge key="e1" tone="brand">adopted</Badge>],
                ['evolution_modeling', 'costBudget 62% → 61% (tighten discipline)', <Badge key="e2" tone="brand">adopted</Badge>],
                ['simulation', 'threatEscalation high → elevated (clean containment)', <Badge key="e3" tone="brand">adopted</Badge>],
                ['meta_learning', 'stricter escalation posture kept after failures', <Badge key="e4" tone="brand">adopted</Badge>],
                ['evolution_modeling', 'forecastHorizon 24h → 36h', <Badge key="e5" tone="sky">proposed</Badge>],
              ]}
            />
          </div>
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
            <span className="font-semibold">Self-learning proof:</span> after a pulse where latency persisted at 2× despite scaling, the organism tightened its own reaction threshold — the next pulse responds earlier with zero human input.
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-900 p-5 text-slate-100 shadow-sm">
        <h3 className="font-semibold text-white">🧠 Final system definition</h3>
        <p className="mt-2 text-sm text-slate-300">
          The Africa Mobility Super App operates as a <span className="text-white">single distributed cognitive enterprise organism</span>: autonomous decision-making, real-time intelligence processing, self-healing infrastructure, continuous cyber defense, automated global operations — with near-zero human dependency. Humans set the guardrails (FAMS activation control, SHIELD approval workflows); the organism runs the loop and evolves.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          {['POST /v1/organism/pulse', 'GET /v1/organism/state', 'GET /v1/organism/layers', 'GET /v1/organism/graph', 'GET /v1/organism/decisions', 'GET /v1/organism/tasks', 'GET /v1/organism/evolution'].map((s) => (
            <span key={s} className="rounded-full bg-slate-800 px-3 py-1.5 font-mono ring-1 ring-slate-700">{s}</span>
          ))}
        </div>
      </section>
    </PortalShell>
  );
}
