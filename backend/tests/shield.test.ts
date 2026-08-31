/**
 * SHIELD — Autonomous Cybersecurity & Threat Intelligence Swarm (docs/29).
 * Engine tests: agent scaling, real-time detection signatures, correlation,
 * fraud swarm, autonomous response policies/approvals, self-healing,
 * zero trust, SOC snapshot and compliance posture.
 */
import { describe, expect, it } from 'vitest';
import {
  ShieldSwarm, planSwarm, AGENT_TAXONOMY,
  type SecurityEvent, type FraudSignal, type ServiceHealth,
} from '../libs/shield/src/index';

function swarm() { return new ShieldSwarm(); }
const ev = (e: Partial<SecurityEvent>): SecurityEvent => ({ category: 'api', source: 'test', action: 'test.call', ...e } as SecurityEvent);

describe('SHIELD — agent swarm', () => {
  it('eight agent families cover the spec surfaces and capabilities', () => {
    const kinds = Object.keys(AGENT_TAXONOMY);
    expect(kinds).toHaveLength(8);
    expect(AGENT_TAXONOMY.network.monitors).toContain('WhatsApp Business API connections');
    expect(AGENT_TAXONOMY.application.monitors).toContain('corporate portal');
    expect(AGENT_TAXONOMY.infrastructure.capabilities).toContain('misconfiguration detection');
    expect(AGENT_TAXONOMY.data.monitors).toContain('AI training data');
    expect(AGENT_TAXONOMY.fraud.monitors).toContain('referral abuse');
    expect(AGENT_TAXONOMIES.data_intelligence_ok()).toBe(true);
  });

  it('scales from hundreds to thousands with demand, threat level and geography', () => {
    const rest = planSwarm({ demandIndex: 1, threatLevel: 'low', countries: 1 });
    const totalRest = Object.values(rest).reduce((a, b) => a + b, 0);
    const surge = planSwarm({ demandIndex: 3.2, threatLevel: 'critical', countries: 7, infrastructureSize: 60, transactionsPerMin: 24_000, vendors: 6_000, activeCustomers: 1_200_000 });
    const totalSurge = Object.values(surge).reduce((a, b) => a + b, 0);
    expect(totalRest).toBeGreaterThanOrEqual(200);       // hundreds at rest
    expect(totalSurge).toBeGreaterThan(totalRest * 3);   // scales hard under attack
    expect(surge.network).toBeGreaterThan(rest.network); // traffic-driven families grow
    expect(surge.fraud).toBeGreaterThan(rest.fraud);
    // never below the floor
    for (const kind of Object.keys(rest) as (keyof typeof rest)[]) expect(rest[kind]).toBeGreaterThanOrEqual(AGENT_TAXONOMY[kind].baseAgents);
  });

  it('deploys, heartbeats and reports fleet health', () => {
    const s = swarm();
    const { total } = s.scale({ demandIndex: 1, threatLevel: 'elevated' });
    expect(total).toBeGreaterThanOrEqual(200);
    const st = s.agents.status();
    expect(st.health).toBe('operational');
    expect(Object.keys(st.byKind)).toHaveLength(8);
  });
});

const AGENT_TAXONOMIES = {
  data_intelligence_ok: () => (AGENT_TAXONOMY.data_intelligence.capabilities.includes('demand forecasting')
    && AGENT_TAXONOMY.data_intelligence.capabilities.includes('revenue optimization')),
};

describe('SHIELD — vehicle cybersecurity (§13 mobility integration)', () => {
  it('gps spoofing and malicious vehicle commands raise immediate threats', () => {
    const t1 = swarm().ingestEvent({ category: 'vehicle', source: 'vehicle-telemetry', principal: 'veh_x', action: 'vehicle.gps_spoofing', outcome: 'denied', riskHints: ['gps_spoofing'] });
    expect(t1.threats.length).toBeGreaterThan(0);
    expect(t1.threats[0].type).toBe('network_anomaly');
    const t2 = swarm().ingestEvent({ category: 'vehicle', source: 'vehicle-command', principal: 'attacker', action: 'vehicle.disable_brakes', outcome: 'denied', riskHints: ['malicious_command'] });
    expect(t2.threats[0].type).toBe('unauthorized_access');
    expect(t2.threats[0].severity).toBe('high');
  });
});

describe('SHIELD — real-time threat detection', () => {
  it('credential abuse: 5+ failed auths in the window raises a threat', () => {
    const s = swarm();
    for (let i = 0; i < 5; i++) s.ingestEvent(ev({ category: 'auth', principal: 'usr_1', ip: '41.58.1.9', action: 'auth.login', outcome: 'failure' }));
    const open = s.detection.list();
    expect(open.some((t) => t.type === 'credential_abuse' && t.principal === 'usr_1')).toBe(true);
  });

  it('unauthorized access: repeated denials escalate; privilege escalation is caught', () => {
    const s = swarm();
    for (let i = 0; i < 3; i++) s.ingestEvent(ev({ principal: 'usr_2', action: 'escrow.release', outcome: 'denied', riskHints: ['rbac_violation'] }));
    expect(s.detection.list().some((t) => t.type === 'unauthorized_access')).toBe(true);
    s.ingestEvent(ev({ principal: 'usr_3', action: 'role.grant_admin', riskHints: ['self_service', 'role_change', 'unapproved_role_change'] }));
    const privesc = s.detection.list().find((t) => t.type === 'privilege_escalation');
    expect(privesc?.severity).toBe('critical');
  });

  it('bot flood and platform-wide DDoS raise distinct threat types', () => {
    const s = swarm();
    for (let i = 0; i < 300; i++) s.ingestEvent(ev({ principal: 'bot_1', action: 'search.rides' }));
    expect(s.detection.list().some((t) => t.type === 'bot_attack')).toBe(true);
    const s2 = swarm();
    for (let i = 0; i < 5000; i++) s2.ingestEvent(ev({ action: 'edge.request' }));
    expect(s2.detection.list().some((t) => t.type === 'ddos_attack' && t.severity === 'critical')).toBe(true);
  });

  it('exfiltration and insider threat: bulk egress, worse off-hours', () => {
    const s = swarm();
    for (let i = 0; i < 5; i++) s.ingestEvent(ev({ category: 'db', principal: 'usr_analyst', action: 'customers.export', bytesOut: 12 * 1024 * 1024, riskHints: ['off_hours', 'bulk_export'] }));
    const t = s.detection.list().find((x) => x.type === 'insider_threat' || x.type === 'data_exfiltration');
    expect(t).toBeDefined();
    expect(t!.score).toBeGreaterThanOrEqual(75);
  });

  it('ransomware indicators raise a critical threat immediately', () => {
    const s = swarm();
    s.ingestEvent(ev({ category: 'infra', source: 'k8s:prod', principal: 'pod-billing-7', action: 'fs.write', riskHints: ['mass_encrypt', 'ransom_note'] }));
    const t = s.detection.list()[0];
    expect(t.type).toBe('malware_ransomware');
    expect(t.severity).toBe('critical');
  });

  it('impossible travel raises account takeover', () => {
    const s = swarm();
    const now = Date.now();
    s.ingestEvent(ev({ category: 'auth', principal: 'usr_9', action: 'auth.login', outcome: 'success', ts: new Date(now - 4 * 60_000), meta: { geo: { lat: 6.45, lng: 3.39, city: 'Lagos' } } }));
    s.ingestEvent(ev({ category: 'auth', principal: 'usr_9', action: 'auth.login', outcome: 'success', ts: new Date(now), meta: { geo: { lat: 52.37, lng: 4.89, city: 'Amsterdam' }, prevGeo: { lat: 6.45, lng: 3.39 } } }));
    expect(s.detection.list().some((t) => t.type === 'account_takeover')).toBe(true);
  });

  it('correlation groups threats per principal into a campaign and bumps severity', () => {
    const s = swarm();
    for (let i = 0; i < 5; i++) s.ingestEvent(ev({ category: 'auth', principal: 'atk_1', ip: '197.210.0.5', action: 'auth.login', outcome: 'failure' }));
    s.ingestEvent(ev({ principal: 'atk_1', ip: '197.210.0.5', action: 'search.rides', riskHints: ['traffic_spike'] }));
    const { campaigns, updated } = s.correlate();
    expect(campaigns.length).toBeGreaterThanOrEqual(1);
    expect(updated).toBeGreaterThanOrEqual(2);
    expect(s.detection.list().every((t) => t.principal !== 'atk_1' || t.correlatedTo)).toBe(true);
  });
});

describe('SHIELD — fraud detection & trust swarm', () => {
  const fs = (x: Partial<FraudSignal>): FraudSignal => ({ kind: 'wallet', principal: 'cus_1', ...x } as FraudSignal);

  it('booking velocity and promo abuse', () => {
    const s = swarm();
    let alert = null as ReturnType<ShieldSwarm['assessFraud']>['alert'];
    for (let i = 0; i < 6 && !alert; i++) alert = s.assessFraud(fs({ kind: 'booking', principal: 'cus_2', meta: { promoRedeemed: true }, deviceId: 'dev_x' })).alert;
    expect(alert).not.toBeNull();
    expect(['booking_velocity', 'promo_abuse']).toContain(alert!.rule);
  });

  it('ATO pattern: credential change then large withdrawal is critical', () => {
    const s = swarm();
    expect(s.assessFraud(fs({ kind: 'account', principal: 'cus_3', deviceId: 'dev_new', meta: { credentialChange: true } })).alert).toBeNull();
    const { alert } = s.assessFraud(fs({ kind: 'wallet', principal: 'cus_3', meta: { direction: 'withdraw' }, amountMinor: 9_000_000 }));
    expect(alert!.rule).toBe('account_takeover_drain');
    expect(alert!.severity).toBe('critical');
    expect(alert!.recommendedActions).toContain('suspend_account');
  });

  it('device clusters expose fake accounts; fake vendor self-dealing is caught', () => {
    const s = swarm();
    for (const p of ['f1', 'f2', 'f3']) s.assessFraud(fs({ kind: 'account', principal: p, deviceId: 'dev_shared' }));
    const cluster = s.fraud.list().find((a) => a.rule === 'device_cluster_fake_accounts');
    expect(cluster).toBeDefined();
    const { alert } = s.assessFraud(fs({ kind: 'vendor', principal: 'vnd_fake', meta: { selfDealtBookings: 5, verificationGaps: true } }));
    expect(alert!.rule).toBe('fake_vendor');
    expect(alert!.score).toBeGreaterThanOrEqual(85);
  });

  it('refund abuse ratio and trust scoring', () => {
    const s = swarm();
    for (let i = 0; i < 5; i++) s.assessFraud(fs({ kind: 'booking', principal: 'cus_4' }));
    for (let i = 0; i < 4; i++) s.assessFraud(fs({ kind: 'refund', principal: 'cus_4' }));
    expect(s.fraud.list().some((a) => a.rule === 'refund_abuse' && a.principal === 'cus_4')).toBe(true);
    expect(s.fraud.trustScore('cus_4')).toBeLessThan(50);
    expect(s.fraud.trustScore('cus_clean')).toBe(100);
  });
});

describe('SHIELD — autonomous response engine (policies, thresholds, approvals)', () => {
  it('auto-actions execute for medium threats; high-impact actions need approval', () => {
    const s = swarm();
    for (let i = 0; i < 5; i++) s.ingestEvent(ev({ category: 'auth', principal: 'rsp_1', action: 'auth.login', outcome: 'failure' }));
    const ledger = s.response.listRecords();
    expect(ledger.some((r) => r.action === 'rate_limit' && r.status === 'executed' && r.mode === 'auto')).toBe(true);
    expect(ledger.filter((r) => r.status === 'pending_approval').every((r) =>
      ['suspend_account', 'disable_credential', 'quarantine_workload', 'isolate_service', 'emergency_workflow'].includes(r.action))).toBe(true);
  });

  it('approval workflow: nothing executes until a super admin decides', () => {
    const s = swarm();
    s.ingestEvent(ev({ category: 'infra', principal: 'pod-web-3', action: 'fs.write', riskHints: ['mass_encrypt'] }));
    const pending = s.response.pendingApprovals();
    expect(pending.length).toBeGreaterThan(0);
    const before = s.response.listRecords().filter((r) => r.status === 'executed' && r.mode === 'approval').length;
    expect(before).toBe(0);
    const apr = pending[0];
    const rec = s.response.decide(apr.id, 'approved', 'admin_root');
    expect(rec?.status).toBe('executed');
    expect(rec?.approvedBy).toBe('admin_root');
    const rejected = s.response.decide(s.response.pendingApprovals()[0]?.id ?? '', 'rejected', 'admin_root');
    if (s.response.pendingApprovals().length === 0) expect(rejected).toBeUndefined();
  });

  it('disarming the engine makes it observe-only (fail-safe)', () => {
    const s = swarm();
    s.response.armed = false;
    for (let i = 0; i < 5; i++) s.ingestEvent(ev({ category: 'auth', principal: 'rsp_2', action: 'auth.login', outcome: 'failure' }));
    const mutating = s.response.listRecords().filter((r) => !['alert_admins', 'escalate_incident'].includes(r.action) && r.mode === 'auto' && r.status === 'executed');
    expect(mutating).toHaveLength(0);
  });
});

describe('SHIELD — self-healing infrastructure', () => {
  const health = (h: Partial<ServiceHealth>): ServiceHealth => ({ service: 'booking-svc', status: 'degraded', ...h } as ServiceHealth);

  it('degraded service → auto restart plan; slow service → reallocate + reroute', () => {
    const s = swarm();
    const { plans, runs } = s.heal([health({ status: 'degraded' }), health({ service: 'search-svc', status: 'degraded', latencyMs: 1500 })]);
    expect(plans.filter(Boolean).length).toBe(2);
    expect(runs.every((r) => r.outcome === 'recovered')).toBe(true);
    expect(plans[1]!.steps).toEqual(['reallocate_resources', 'reroute_traffic']);
  });

  it('database down → failover + recovery + backup restore behind approval; approval executes it', () => {
    const s = swarm();
    const plan = s.healing.evaluate(health({ service: 'postgres-primary', status: 'down' }))!;
    expect(plan.steps).toContain('activate_failover');
    expect(plan.mode).toBe('approval');
    const run = s.healing.execute(plan);
    expect(run.outcome).toBe('awaiting_approval');
    expect(s.healing.approve(run.id)!.outcome).toBe('recovered');
  });

  it('healthy services never trigger plans; anti-flap prevents re-trigger loops', () => {
    const s = swarm();
    expect(s.healing.evaluate(health({ status: 'healthy' }))).toBeNull();
    const h = health({ status: 'down' });
    s.healing.execute(s.healing.evaluate(h)!);
    expect(s.healing.evaluate(h)).toBeNull(); // anti-flap window
  });
});

describe('SHIELD — zero trust framework', () => {
  it('least privilege denies out-of-role capabilities', () => {
    const s = swarm();
    const r = s.verify({ principal: 'cus_1', role: 'customer', capability: 'escrow.release', mfaDone: true });
    expect(r.decision).toBe('deny');
    expect(r.reasons[0]).toMatch(/least privilege/);
  });

  it('risk-based authentication: step-up MFA for sensitive ops, deny under high risk', () => {
    const s = swarm();
    const stepUp = s.verify({ principal: 'adm_1', role: 'admin', capability: 'customers.export', mfaDone: false, deviceTrust: 80 });
    expect(stepUp.decision).toBe('step_up_mfa');
    const ok = s.verify({ principal: 'root', role: 'super_admin', capability: 'fams.admin', mfaDone: true, deviceTrust: 90 });
    expect(ok.decision).toBe('allow');
    const risky = s.verify({ principal: 'adm_2', role: 'admin', capability: 'shield.soc', mfaDone: true, deviceTrust: 80, riskScore: 80 });
    expect(risky.decision).toBe('deny');
  });

  it('device trust scoring penalizes incidents and shared accounts', () => {
    const s = swarm();
    const clean = s.ztrust.deviceTrustScore('dev_a', { principal: 'u1', mfa: true });
    const shared = s.ztrust.deviceTrustScore('dev_b', { principal: 'u1' });
    s.ztrust.deviceTrustScore('dev_b', { principal: 'u2' });
    s.ztrust.deviceTrustScore('dev_b', { principal: 'u3', incident: true });
    const dirty = s.ztrust.deviceTrustScore('dev_b');
    expect(clean).toBeGreaterThan(dirty);
    expect(shared).toBeGreaterThan(dirty);
  });

  it('micro-segmentation: app→money allowed, data segment isolated, edge never reaches data', () => {
    const s = swarm();
    expect(s.ztrust.canTalk('booking-svc', 'wallet-svc')).toBe(true);
    expect(s.ztrust.canTalk('postgres', 'booking-svc')).toBe(false);
    expect(s.ztrust.canTalk('cdn', 'postgres')).toBe(false);
    expect(s.ztrust.canTalk('admin-web', 'fams-svc')).toBe(true);
  });
});

describe('SHIELD — SOC, compliance, intelligence & posture', () => {
  it('SOC snapshot: score, risk level, threats, agents, fraud, prediction', () => {
    const s = swarm();
    s.scale({ demandIndex: 1.5, threatLevel: 'high' });
    for (let i = 0; i < 5; i++) s.ingestEvent(ev({ category: 'auth', principal: 'soc_1', action: 'auth.login', outcome: 'failure' }));
    const soc = s.soc();
    expect(soc.activeThreats).toBeGreaterThan(0);
    expect(soc.agentActivity.totalAgents).toBeGreaterThanOrEqual(200);
    expect(['low', 'elevated', 'high', 'critical']).toContain(soc.riskLevel);
    expect(soc.vulnerabilities.top.length).toBeGreaterThan(0);
    expect(soc.prediction.likelyNextThreats).toBeDefined();
  });

  it('security score drops under open threats and recovers when contained', () => {
    const s = swarm();
    const before = s.securityScore();
    for (let i = 0; i < 5; i++) s.ingestEvent(ev({ category: 'auth', principal: 'score_1', action: 'auth.login', outcome: 'failure' }));
    const during = s.securityScore();
    expect(during).toBeLessThan(before);
    for (const t of s.detection.list()) s.detection.setStatus(t.id, 'contained');
    expect(s.securityScore()).toBeGreaterThan(during);
  });

  it('threat intelligence: correlation to MITRE patterns, prioritized vulns, playbooks, prediction', () => {
    const s = swarm();
    s.ingestEvent(ev({ category: 'infra', principal: 'pod-x', action: 'fs.write', riskHints: ['mass_encrypt'] }));
    const threat = s.detection.list()[0];
    const rec = s.intel.recommend(threat);
    expect(rec.pattern?.mitre).toBe('T1486');
    expect(rec.playbook.id).toBe('pb.ransomware');
    const prio = s.intel.prioritize();
    expect(prio[0].risk).toBeGreaterThanOrEqual(prio[prio.length - 1].risk);
    expect(s.intel.predict().topVulnerabilities.length).toBeGreaterThan(0);
  });

  it('behavioral deviation feeds risk scoring', () => {
    const s = swarm();
    expect(s.intel.deviation('usr_0001', { hour: 14, city: 'Lagos', deviceId: 'dev_iphone11' })).toBe(0);
    expect(s.intel.deviation('usr_0001', { hour: 3, city: 'Kano', deviceId: 'dev_unknown', amountMinor: 40_000_000 })).toBeGreaterThanOrEqual(75);
  });

  it('compliance posture covers SOC 2, ISO 27001, GDPR, NDPR, PCI DSS + audit reports', () => {
    const c = swarm().compliance();
    const names = c.frameworks.map((f) => f.framework);
    expect(names.some((n) => n.includes('SOC 2'))).toBe(true);
    expect(names.some((n) => n.includes('ISO 27001'))).toBe(true);
    expect(names.some((n) => n.includes('PCI DSS'))).toBe(true);
    expect(names.filter((n) => n.includes('GDPR') || n.includes('NDPR'))).toHaveLength(2);
    expect(c.reports).toContain('forensic-record');
    expect(c.frameworks.every((f) => f.controlsMet <= f.controlsTotal)).toBe(true);
  });
});
