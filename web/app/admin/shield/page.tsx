import { Badge, DataTable, PortalShell, StatCard } from '@/components/ui';

export const metadata = { title: 'AMSA · SHIELD — Security Operations Center' };

const NAV = [
  { label: 'Overview (SOC)', icon: '🛡', active: true },
  { label: 'Threats', icon: '⚠️' },
  { label: 'Incidents', icon: '🚨' },
  { label: 'Fraud alerts', icon: '🕵' },
  { label: 'Agent swarm', icon: '🐝' },
  { label: 'Vulnerabilities', icon: '🧩' },
  { label: 'Threat intel', icon: '🧠' },
  { label: 'Response & approvals', icon: '✋' },
  { label: 'Self-healing', icon: '♻️' },
  { label: 'Zero trust', icon: '🔑' },
  { label: 'Compliance', icon: '📋' },
];


export default function ShieldSocPage() {
  return (
    <PortalShell
      title="SHIELD — AI Security Command Center"
      subtitle="Autonomous cybersecurity, threat intelligence & platform defense swarm — 24/7 detection, containment, response, self-healing and compliance"
      role="Super admin (RBAC + MFA + approval workflows)"
      nav={NAV}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Security score" value="91 / 100" delta="+2" sub="risk level: elevated" />
        <StatCard label="Active threats" value="3" sub="1 critical · 1 high · 1 medium" />
        <StatCard label="Agent fleet" value="1,240" delta="+380" sub="8 families · scaled for threat" />
        <StatCard label="Fraud alerts (24h)" value="17" sub="₦4.2M blocked before payout" />
        <StatCard label="Pending approvals" value="2" sub="high-impact containment queued" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">⚠️ Active threats &amp; incident timeline</h3>
          <div className="mt-4">
            <DataTable
              headers={['Threat', 'Type', 'Score', 'Response']}
              rows={[
                ['thr_341 · pod-web-9', 'malware_ransomware', '95', <><Badge tone="danger">critical</Badge> <Badge tone="sky">awaiting approval</Badge></>],
                ['thr_338 · 197.210.0.5', 'credential_abuse → campaign cmp_atk', '82', <><Badge tone="warning">high</Badge> <Badge tone="brand">rate-limited</Badge></>],
                ['thr_336 · usr_88', 'account_takeover (impossible travel)', '70', <><Badge tone="warning">high</Badge> <Badge tone="brand">tokens revoked</Badge></>],
                ['thr_330 · bot_12', 'bot_attack', '62', <Badge tone="brand">blocked</Badge>],
              ]}
            />
          </div>
          <div className="mt-4 rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-200">
            <div className="text-slate-400">// incident timeline — INC-1042</div>
            <div>15:41:02 agent infra-7 ▲ mass_encrypt signatures (pod-web-9)</div>
            <div>15:41:03 threat raised score 95 → policy critical</div>
            <div>15:41:03 auto: revoke_tokens ✓ alert_admins ✓ escalate_incident ✓</div>
            <div>15:41:04 approval queued: isolate_service + quarantine_workload</div>
            <div>15:43:11 admin_root approved → pod isolated, traffic rerouted</div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🐝 Agent swarm — 8 families, elastic scale</h3>
          <div className="mt-4">
            <DataTable
              headers={['Family', 'Agents', 'Monitors', 'Findings']}
              rows={[
                ['🌐 Network', '240', 'traffic · VPN · APIs · PSPs · WhatsApp BA', '12'],
                ['📱 Application', '215', '10 apps · APIs · microservices · webhooks', '8'],
                ['🏗 Infrastructure', '180', 'AWS · EKS · containers · DB · Redis · S3', '15'],
                ['🪪 Identity', '150', 'auth · MFA · sessions · fingerprints', '6'],
                ['🗃 Data', '150', 'customer · payment · escrow · AI training', '3'],
                ['🧠 Threat intel', '95', 'feeds · CVEs · advisories · campaigns', '21'],
                ['🕵 Fraud & trust', '130', 'bookings · wallet · escrow · promos', '17'],
                ['📊 Data intelligence', '80', 'performance · demand · revenue · capacity', '2'],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">Scales hundreds → thousands on demand, threat level, transaction volume, geography, vendor growth and workload (POST /v1/shield/agents/scale).</p>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🕵 Fraud alerts &amp; trust</h3>
          <div className="mt-4">
            <DataTable
              headers={['Alert', 'Rule', 'Trust after', 'Action']}
              rows={[
                ['fra_96 · cus_3312', 'account_takeover_drain', '8', <><Badge tone="danger">critical</Badge> <Badge tone="sky">awaiting approval</Badge></>],
                ['fra_95 · dev_8821', 'device_cluster_fake_accounts (4 accts)', '15', <Badge tone="brand">suspended</Badge>],
                ['fra_94 · cus_1187', 'promo_abuse (7 redemptions)', '28', <Badge tone="brand">blocked</Badge>],
                ['fra_93 · vnd_fake', 'fake_vendor (self-dealt + KYC gaps)', '12', <Badge tone="sky">awaiting approval</Badge>],
                ['fra_92 · cus_2210', 'wallet_cycling (funds↔withdraw)', '30', <Badge tone="brand">rate-limited</Badge>],
              ]}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">🧩 Vulnerabilities &amp; 🧠 threat intel</h3>
          <div className="mt-4">
            <DataTable
              headers={['Vulnerability', 'CVSS', 'Risk', 'Status']}
              rows={[
                ['S3 vendor-docs public list', '9.1', '73', <Badge tone="warning">open</Badge>],
                ['redis AUTH not enforced', '8.8', '56', <Badge key="v2" tone="warning">patching</Badge>],
                ['SSRF via absolute URL (gateway)', '8.2', '57', <Badge key="v3" tone="warning">patching</Badge>],
                ['k8s ingress no-TLS (2 hosts)', '7.4', '45', <Badge tone="warning">open</Badge>],
                ['lodash cmd injection', '7.2', '26', <Badge tone="brand">mitigated</Badge>],
              ]}
            />
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            <div className="font-semibold text-slate-900">Intel feed · prediction</div>
            <div className="mt-1">MITRE T1110 credential stuffing campaign targeting African fintechs · IOCs enriched</div>
            <div>Predicted next: credential_abuse (14d history) · top exposure: S3 misconfig</div>
            <div className="mt-2 text-slate-500">Recommendation: rotate PSP webhook secrets · enforce TLS redirect · KEV-driven patch SLA</div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="font-semibold text-slate-900">♻️ Self-healing &amp; platform health</h3>
          <div className="mt-4">
            <DataTable
              headers={['Service', 'Health', 'Recovery run', 'Outcome']}
              rows={[
                ['booking-svc', <Badge tone="brand">healthy</Badge>, 'rec_41 · restart_service', <Badge tone="brand">recovered · 38s</Badge>],
                ['search-svc', <Badge tone="brand">healthy</Badge>, 'rec_40 · reallocate + reroute', <Badge tone="brand">recovered · 2m</Badge>],
                ['postgres-primary', <Badge key="h5" tone="brand">failover ok</Badge>, 'rec_39 · failover + PITR', <Badge tone="brand">recovered · 11m</Badge>],
                ['pod-web-9', <Badge tone="warning">isolated</Badge>, 'rec_38 · ransomware runbook', <Badge tone="sky">awaiting approval</Badge>],
                ['redis-cluster', <Badge tone="brand">healthy</Badge>, '—', '—'],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">Runbooks: service restart · container recovery · node recovery · resource reallocation · traffic rerouting · failover · backup restoration · database recovery. Destructive steps require approval.</p>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
          <h3 className="font-semibold text-emerald-900">📋 Compliance posture</h3>
          <div className="mt-3 space-y-2 text-sm">
            {[
              ['SOC 2 Type II readiness', '85% controls'],
              ['ISO 27001:2022 readiness', '82% controls'],
              ['GDPR', 'ready · 95%'],
              ['NDPR (Nigeria)', 'ready · 97%'],
              ['PCI DSS 4.0', 'ready · 93% (SAQ-A)'],
              ['Enterprise standards', 'ready · zero trust live'],
            ].map(([name, status]) => (
              <div key={name} className="flex items-center justify-between rounded-xl border border-emerald-200 bg-white px-4 py-2.5">
                <span className="font-medium text-slate-800">{name}</span>
                <span className="text-xs font-semibold text-emerald-700">{status}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-emerald-800/80">Reports: security-audit-log · incident · compliance · forensic · access-review · assessment — every autonomous action is trail-logged.</p>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-900 p-5 text-slate-100 shadow-sm">
        <h3 className="font-semibold text-white">🔑 Zero trust + autonomous response pipeline</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
          {['Request', 'Device trust score', 'Continuous verification', 'Least privilege', 'Risk-based decision', 'Detect → correlate', 'Policy engine', 'Auto / approval', 'Contain → heal'].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-full bg-slate-800 px-3 py-1.5 ring-1 ring-slate-700">{s}</span>
              {i < 8 && <span className="text-slate-500">→</span>}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">Guardrails: high-impact actions (suspend · disable · quarantine · isolate · emergency) always require human approval · the engine can be disarmed to observe-only in one call · micro-segmentation denies data-tier ingress · every decision, action and recovery is audit-logged for SOC 2 / ISO 27001 / GDPR / NDPR / PCI DSS evidence.</p>
      </section>
    </PortalShell>
  );
}