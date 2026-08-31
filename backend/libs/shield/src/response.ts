/**
 * Autonomous Response Engine — executes or proposes containment actions when
 * threats are confirmed. Every action follows configurable security policies
 * with risk thresholds and approval workflows: high-impact actions (suspend,
 * isolate, disable credentials) require human approval unless auto-authorized.
 */

import type { Severity, Threat } from './detection';
import type { FraudAlert } from './fraud';

export type ResponseActionType =
  | 'block_request' | 'rate_limit' | 'suspend_account' | 'disable_credential'
  | 'quarantine_workload' | 'revoke_tokens' | 'isolate_service' | 'emergency_workflow'
  | 'alert_admins' | 'escalate_incident';

export const HIGH_IMPACT: ResponseActionType[] = ['suspend_account', 'disable_credential', 'quarantine_workload', 'isolate_service'];

export interface ResponsePolicy {
  action: ResponseActionType;
  minSeverity: Severity;
  minScore: number;
  mode: 'auto' | 'approval' | 'notify';   // execute / human approval / observe-only
  cooldownSec: number;
}

export interface ResponseRecord {
  id: string;
  ts: Date;
  threatId?: string;
  fraudAlertId?: string;
  action: ResponseActionType;
  mode: ResponsePolicy['mode'];
  status: 'executed' | 'pending_approval' | 'rejected' | 'expired';
  target: string;                        // principal / service / ip
  reason: string;
  executedBy: 'shield-autonomous' | 'admin';
  approvedBy?: string;
}

export interface ApprovalRequest {
  id: string;
  recordId: string;
  action: ResponseActionType;
  target: string;
  threatId?: string;
  reason: string;
  riskScore: number;
  requestedAt: Date;
  decidedAt?: Date;
  decidedBy?: string;
  decision?: 'approved' | 'rejected';
}

const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export const DEFAULT_POLICIES: ResponsePolicy[] = [
  { action: 'block_request', minSeverity: 'medium', minScore: 45, mode: 'auto', cooldownSec: 60 },
  { action: 'rate_limit', minSeverity: 'medium', minScore: 45, mode: 'auto', cooldownSec: 300 },
  { action: 'alert_admins', minSeverity: 'medium', minScore: 40, mode: 'auto', cooldownSec: 0 },
  { action: 'escalate_incident', minSeverity: 'high', minScore: 70, mode: 'auto', cooldownSec: 0 },
  { action: 'revoke_tokens', minSeverity: 'high', minScore: 65, mode: 'auto', cooldownSec: 0 },
  { action: 'suspend_account', minSeverity: 'high', minScore: 70, mode: 'approval', cooldownSec: 0 },
  { action: 'disable_credential', minSeverity: 'high', minScore: 75, mode: 'approval', cooldownSec: 0 },
  { action: 'quarantine_workload', minSeverity: 'critical', minScore: 85, mode: 'approval', cooldownSec: 0 },
  { action: 'isolate_service', minSeverity: 'critical', minScore: 90, mode: 'approval', cooldownSec: 0 },
  { action: 'emergency_workflow', minSeverity: 'critical', minScore: 90, mode: 'approval', cooldownSec: 0 },
];

export class ResponseEngine {
  private policies: ResponsePolicy[];
  private records: ResponseRecord[] = [];
  private approvals: ApprovalRequest[] = [];
  private cooldowns = new Map<string, number>();
  private seq = 0;
  /** Guardrail switch — when false the engine only observes and alerts. */
  armed = true;

  constructor(policies: ResponsePolicy[] = DEFAULT_POLICIES) { this.policies = policies; }

  setPolicies(p: ResponsePolicy[]): void { this.policies = p; }
  listPolicies(): ResponsePolicy[] { return [...this.policies]; }

  /** Decide + act on a threat per policy. Returns the action ledger entries. */
  respond(threat: Threat, recommended?: string[]): ResponseRecord[] {
    const out: ResponseRecord[] = [];
    for (const pol of this.policies) {
      const recommendedByIntel = !recommended || recommended.length === 0 || recommended.includes(pol.action) || pol.action === 'alert_admins' || pol.action === 'escalate_incident';
      if (!recommendedByIntel) continue;
      if (SEVERITY_RANK[threat.severity] < SEVERITY_RANK[pol.minSeverity] || threat.score < pol.minScore) continue;
      if (this.inCooldown(threat, pol)) continue;

      const id = `rsp_${++this.seq}`;
      const target = threat.principal ?? threat.ip ?? 'unknown';
      if (!this.armed || pol.mode === 'notify') {
        out.push(this.record({ id, threatId: threat.id, action: pol.action, mode: 'notify', status: 'executed', target, reason: `${threat.type} score ${threat.score} — notify only` }));
        continue;
      }
      if (pol.mode === 'auto') {
        out.push(this.record({ id, threatId: threat.id, action: pol.action, mode: 'auto', status: 'executed', target, reason: `${threat.type} score ${threat.score} ≥ policy(${pol.minSeverity}/${pol.minScore})` }));
        if (pol.action !== 'alert_admins' && pol.action !== 'escalate_incident') threat.status = 'containing';
      } else {
        // approval workflow — never executes without a human decision
        const apr: ApprovalRequest = {
          id: `apr_${id}`, recordId: id, action: pol.action, target, threatId: threat.id,
          reason: `${threat.type} score ${threat.score} → ${pol.action} (high-impact)`,
          riskScore: threat.score, requestedAt: new Date(),
        };
        this.approvals.push(apr);
        out.push(this.record({ id, threatId: threat.id, action: pol.action, mode: 'approval', status: 'pending_approval', target, reason: apr.reason }));
      }
      this.cooldowns.set(`${pol.action}:${target}`, Date.now() + pol.cooldownSec * 1000);
    }
    return out;
  }

  /** Fraud alerts feed the same engine with their recommended actions. */
  respondFraud(alert: FraudAlert): ResponseRecord[] {
    const pseudo: Threat = {
      id: `fraud:${alert.id}`, ts: alert.ts, type: 'automated_abuse', severity: alert.severity,
      score: alert.score, principal: alert.principal, category: 'wallet',
      sources: [], signals: alert.evidence, status: 'open',
    };
    return this.respond(pseudo, alert.recommendedActions);
  }

  decide(approvalId: string, decision: 'approved' | 'rejected', admin: string): ResponseRecord | undefined {
    const apr = this.approvals.find((a) => a.id === approvalId);
    if (!apr || apr.decision) return undefined;
    apr.decision = decision; apr.decidedAt = new Date(); apr.decidedBy = admin;
    const rec = this.records.find((r) => r.id === apr.recordId);
    if (!rec) return undefined;
    if (decision === 'approved') {
      rec.status = 'executed'; rec.approvedBy = admin; rec.executedBy = 'admin';
    } else {
      rec.status = 'rejected'; rec.approvedBy = admin;
    }
    return rec;
  }

  pendingApprovals(): ApprovalRequest[] { return this.approvals.filter((a) => !a.decision); }
  listRecords(): ResponseRecord[] { return [...this.records]; }

  private inCooldown(t: Threat, pol: ResponsePolicy): boolean {
    const key = `${pol.action}:${t.principal ?? t.ip ?? 'unknown'}`;
    return (this.cooldowns.get(key) ?? 0) > Date.now();
  }

  private record(r: Omit<ResponseRecord, 'ts' | 'executedBy'> & Partial<Pick<ResponseRecord, 'ts' | 'executedBy'>>): ResponseRecord {
    const full: ResponseRecord = { ts: new Date(), executedBy: 'shield-autonomous', ...r };
    this.records.push(full);
    return full;
  }
}
