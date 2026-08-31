/**
 * ShieldSwarm — the orchestrator that ties agents, detection, fraud, intel,
 * response, healing and zero trust into one autonomous defense system, and
 * exposes the SOC (Security Operations Center) snapshot + compliance posture.
 */

import { AgentSwarm, type SwarmSignals } from './agents';
import { DetectionEngine, type SecurityEvent, type Threat } from './detection';
import { FraudSwarm, type FraudSignal, type FraudAlert } from './fraud';
import { IntelBase, type Playbook, type AttackPattern, type Vulnerability, type BehavioralBaseline } from './intel';
import { ResponseEngine, type ResponseRecord, type ResponsePolicy } from './response';
import { HealingEngine, type ServiceHealth, type RecoveryPlan, type RecoveryRun } from './healing';
import { ZeroTrustEngine, type AccessRequest, type AccessResult } from './ztrust';

export interface ComplianceFramework {
  framework: string;
  status: 'ready' | 'in_progress' | 'gap';
  controlsTotal: number;
  controlsMet: number;
  notes: string;
}

export class ShieldSwarm {
  readonly agents = new AgentSwarm();
  readonly detection = new DetectionEngine();
  readonly fraud = new FraudSwarm();
  readonly intel = new IntelBase();
  readonly response = new ResponseEngine();
  readonly healing = new HealingEngine();
  readonly ztrust = new ZeroTrustEngine();

  constructor() { this.seedIntel(); }

  /** Deploy/resize the fleet for the current workload. */
  scale(signals: SwarmSignals) { return this.agents.scale(signals); }

  /** Real-time pipeline: event → detection → correlation → response. */
  ingestEvent(event: SecurityEvent): { threats: Threat[]; actions: ResponseRecord[] } {
    const threats = this.detection.ingest(event);
    const actions: ResponseRecord[] = [];
    for (const t of threats) {
      const { playbook } = this.intel.recommend(t);
      actions.push(...this.response.respond(t, playbook.autoActions));
    }
    return { threats, actions };
  }

  /** Fraud pipeline: signal → alert → response. */
  assessFraud(signal: FraudSignal): { alert: FraudAlert | null; actions: ResponseRecord[] } {
    const alert = this.fraud.assess(signal);
    const actions = alert ? this.response.respondFraud(alert) : [];
    return { alert, actions };
  }

  /** Correlation sweep (cron in production, every minute). */
  correlate(): ReturnType<DetectionEngine['correlate']> {
    const result = this.detection.correlate();
    // correlated (campaign) threats get a response too
    for (const t of this.detection.list({ status: 'open' })) {
      if (t.correlatedTo) this.response.respond(t);
    }
    return result;
  }

  /** Self-healing sweep over service health. */
  heal(services: ServiceHealth[]): { plans: (RecoveryPlan | null)[]; runs: RecoveryRun[] } {
    const plans = services.map((h) => this.healing.evaluate(h));
    const runs = plans.filter((p): p is RecoveryPlan => p !== null && p.mode === 'auto').map((p) => this.healing.execute(p));
    return { plans, runs };
  }

  /** Zero-trust gate — used per request by the API layer. */
  verify(access: AccessRequest): AccessResult { return this.ztrust.decide(access); }

  /** Security score 0-100: posture = threats, vulns, incidents, availability. */
  securityScore(): number {
    const open = this.detection.list({ status: 'open' });
    const containing = this.detection.list({ status: 'containing' });
    const vulnPenalty = Math.min(30, this.intel.prioritize().reduce((s, v) => s + v.risk / 20, 0));
    const threatPenalty = Math.min(45, open.length * 4 + containing.length * 2);
    const fraudPenalty = Math.min(15, this.fraud.list().filter((a) => a.severity === 'critical' || a.severity === 'high').length * 3);
    const failedRecovery = this.healing.list().filter((r) => r.outcome === 'failed').length * 5;
    return Math.max(0, Math.min(100, 100 - vulnPenalty - threatPenalty - fraudPenalty - failedRecovery));
  }

  /** SOC command-center snapshot. */
  soc() {
    const threats = this.detection.list();
    const open = threats.filter((t) => t.status === 'open' || t.status === 'containing');
    const vulns = this.intel.prioritize();
    const score = this.securityScore();
    return {
      generatedAt: new Date().toISOString(),
      securityScore: score,
      riskLevel: score >= 85 ? 'low' : score >= 65 ? 'elevated' : score >= 45 ? 'high' : 'critical',
      activeThreats: open.length,
      threatsBySeverity: {
        critical: open.filter((t) => t.severity === 'critical').length,
        high: open.filter((t) => t.severity === 'high').length,
        medium: open.filter((t) => t.severity === 'medium').length,
        low: open.filter((t) => t.severity === 'low').length,
      },
      incidents: {
        total: threats.length,
        contained: threats.filter((t) => t.status === 'contained' || t.status === 'resolved').length,
        pendingApprovals: this.response.pendingApprovals().length,
      },
      fraudAlerts: this.fraud.list().slice(-20),
      vulnerabilities: { open: vulns.length, top: vulns.slice(0, 5), buckets: this.intel.severityBuckets() },
      agentActivity: this.agents.status(),
      platformHealth: this.healing.list().slice(-10),
      prediction: this.intel.predict(),
      responseLedger: this.response.listRecords().slice(-20),
    };
  }

  /** Audit, governance & compliance posture (SOC 2 / ISO 27001 / GDPR / NDPR / PCI DSS). */
  compliance(): { frameworks: ComplianceFramework[]; auditTrail: { threats: number; actions: number; recoveries: number }; reports: string[] } {
    const met = (pct: number, total: number) => Math.round(total * pct);
    return {
      frameworks: [
        { framework: 'SOC 2 Type II readiness', status: 'in_progress', controlsTotal: 61, controlsMet: met(0.85, 61), notes: 'continuous monitoring live; evidence automation via shield audit trail' },
        { framework: 'ISO 27001:2022 readiness', status: 'in_progress', controlsTotal: 93, controlsMet: met(0.82, 93), notes: 'Annex A controls mapped to shield agents (docs/17 + docs/29)' },
        { framework: 'GDPR', status: 'ready', controlsTotal: 99, controlsMet: met(0.95, 99), notes: 'DPIA, DSR workflows, EU data residency option (docs/17 §3)' },
        { framework: 'NDPR (Nigeria)', status: 'ready', controlsTotal: 64, controlsMet: met(0.97, 64), notes: 'NITDA registration pathway, local residency, breach notification 72h' },
        { framework: 'PCI DSS 4.0', status: 'ready', controlsTotal: 264, controlsMet: met(0.93, 264), notes: 'tokenized PSP integrations; SAQ-A scope; quarterly ASV scans in CI' },
        { framework: 'Enterprise security standards', status: 'ready', controlsTotal: 40, controlsMet: met(0.9, 40), notes: 'zero trust, MFA everywhere, least privilege, audit logging' },
      ],
      auditTrail: {
        threats: this.detection.list().length,
        actions: this.response.listRecords().length,
        recoveries: this.healing.list().length,
      },
      reports: ['security-audit-log', 'incident-report', 'compliance-report', 'forensic-record', 'access-review', 'security-assessment'],
    };
  }

  private seedIntel(): void {
    const patterns: AttackPattern[] = [
      { id: 'apt.credential-stuffing', name: 'Credential stuffing & brute force', mitre: 'T1110', tactics: ['initial-access'], matches: ['credential_abuse', 'unauthorized_access'], playbook: 'pb.cred-abuse' },
      { id: 'apt.ato', name: 'Account takeover chain', mitre: 'T1078', tactics: ['initial-access', 'persistence'], matches: ['account_takeover', 'session_hijack'], playbook: 'pb.ato' },
      { id: 'apt.ddos', name: 'Volumetric DDoS / bot flood', mitre: 'T1498', tactics: ['impact'], matches: ['ddos_attack', 'bot_attack'], playbook: 'pb.ddos' },
      { id: 'apt.exfil', name: 'Data exfiltration over API', mitre: 'T1567', tactics: ['exfiltration'], matches: ['data_exfiltration', 'insider_threat'], playbook: 'pb.exfil' },
      { id: 'apt.ransomware', name: 'Ransomware / mass encryption', mitre: 'T1486', tactics: ['impact'], matches: ['malware_ransomware'], playbook: 'pb.ransomware' },
      { id: 'apt.privesc', name: 'Privilege escalation abuse', mitre: 'T1068', tactics: ['privilege-escalation'], matches: ['privilege_escalation'], playbook: 'pb.privesc' },
    ];
    patterns.forEach((p) => this.intel.addPattern(p));

    const playbooks: Playbook[] = [
      { id: 'pb.cred-abuse', name: 'Credential abuse containment', triggers: ['credential_abuse'], autoActions: ['rate_limit', 'block_request', 'alert_admins'], steps: ['rate-limit source', 'force captcha/MFA on account', 'review auth log', 'reset credentials if confirmed'] },
      { id: 'pb.ato', name: 'Account takeover response', triggers: ['account_takeover', 'session_hijack'], autoActions: ['revoke_tokens', 'block_request', 'escalate_incident'], steps: ['revoke all sessions', 'freeze wallet movements', 'notify customer (SMS+WhatsApp)', 'restore access via verified channel'] },
      { id: 'pb.ddos', name: 'DDoS absorption', triggers: ['ddos_attack', 'bot_attack'], autoActions: ['rate_limit', 'block_request', 'alert_admins'], steps: ['enable edge rate limiting', 'challenge bots', 'scale edge capacity', 'notify ISP/AWS Shield'] },
      { id: 'pb.exfil', name: 'Exfiltration stop', triggers: ['data_exfiltration', 'insider_threat'], autoActions: ['revoke_tokens', 'quarantine_workload', 'escalate_incident'], steps: ['cut egress path', 'quarantine workload', 'preserve forensic snapshot', 'legal/HR escalation'] },
      { id: 'pb.ransomware', name: 'Ransomware response', triggers: ['malware_ransomware'], autoActions: ['isolate_service', 'quarantine_workload', 'escalate_incident', 'emergency_workflow'], steps: ['isolate affected services', 'snapshot for forensics', 'restore from clean backups', 'activate crisis comms'] },
      { id: 'pb.privesc', name: 'Privilege escalation response', triggers: ['privilege_escalation'], autoActions: ['disable_credential', 'revoke_tokens', 'escalate_incident'], steps: ['revert unauthorized grants', 'disable involved credentials', 'audit all recent admin actions'] },
      { id: 'pb.default', name: 'Generic containment', triggers: ['*'], autoActions: ['alert_admins'], steps: ['triage', 'contain', 'eradicate', 'recover', 'lesson learned'] },
    ];
    playbooks.forEach((p) => this.intel.addPlaybook(p));

    const vulns: Vulnerability[] = [
      { id: 'vuln.node-ssrf-001', cve: 'CVE-2024-2151', component: 'api-gateway (axios)', title: 'SSRF via absolute URL', cvss: 8.2, exploitLikelihood: 0.7, status: 'patching', slaHours: 24 },
      { id: 'vuln.ingress-misconfig', component: 'k8s ingress', title: 'Ingress allows HTTP (no TLS redirect) on 2 hosts', cvss: 7.4, exploitLikelihood: 0.5, status: 'open', slaHours: 72 },
      { id: 'vuln.dep-lodash', cve: 'CVE-2021-23337', component: 'web (lodash<4.17.21)', title: 'Command injection', cvss: 7.2, exploitLikelihood: 0.3, status: 'mitigated', slaHours: 168 },
      { id: 'vuln.s3-public', component: 'S3 vendor-docs', title: 'Bucket policy allows public list', cvss: 9.1, exploitLikelihood: 0.6, status: 'open', slaHours: 24 },
      { id: 'vuln.redis-noauth', component: 'redis cache', title: 'AUTH not enforced on replication port', cvss: 8.8, exploitLikelihood: 0.4, status: 'patching', slaHours: 48 },
    ];
    vulns.forEach((v) => this.intel.addVulnerability(v));

    const baselines: BehavioralBaseline[] = [
      { principal: 'usr_0001', activeHours: [6, 23], cities: ['Lagos'], devices: ['dev_iphone11'], avgTxMinor: 4_500_000, samples: 210 },
      { principal: 'vnd_a', activeHours: [7, 20], cities: ['Lagos'], devices: ['dev_fleet_tab'], avgTxMinor: 12_000_000, samples: 88 },
      { principal: 'corp_001', activeHours: [8, 18], cities: ['Abuja', 'Lagos'], devices: ['dev_corp_web'], avgTxMinor: 25_000_000, samples: 46 },
    ];
    baselines.forEach((b) => this.intel.addBaseline(b));
  }
}

/** Process-wide singleton (distributed agent mesh in production). */
export const shield = new ShieldSwarm();
