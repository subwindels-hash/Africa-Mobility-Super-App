/**
 * Self-Healing Infrastructure — automated recovery runbooks that maintain
 * business continuity and availability during incidents: service restart,
 * container/node recovery, resource reallocation, traffic rerouting, failover,
 * backup restoration and database recovery.
 */

export type ServiceStatus = 'healthy' | 'degraded' | 'down';

export interface ServiceHealth {
  service: string;                 // e.g. 'api-gateway', 'booking-svc', 'postgres-primary'
  status: ServiceStatus;
  latencyMs?: number;
  errorRate?: number;              // 0-1
  replicas?: number;
  meta?: Record<string, unknown>;
}

export type RecoveryStep =
  | 'restart_service' | 'recover_container' | 'recover_node' | 'reallocate_resources'
  | 'reroute_traffic' | 'activate_failover' | 'restore_backup' | 'recover_database'
  | 'page_oncall';

export interface RecoveryPlan {
  service: string;
  trigger: string;
  steps: RecoveryStep[];
  objective: string;               // business-continuity note
  mode: 'auto' | 'approval';
  estimatedRtoMin: number;
}

export interface RecoveryRun {
  id: string;
  plan: RecoveryPlan;
  startedAt: Date;
  completedAt?: Date;
  outcome: 'recovered' | 'degraded_recovered' | 'failed' | 'awaiting_approval';
  stepsDone: RecoveryStep[];
}

const RUNBOOKS: { match: (h: ServiceHealth) => boolean; steps: RecoveryStep[]; rto: number; objective: string }[] = [
  { match: (h) => h.status === 'degraded' && (h.latencyMs ?? 0) > 800, steps: ['reallocate_resources', 'reroute_traffic'], rto: 2, objective: 'shed load, keep serving at reduced capacity' },
  { match: (h) => h.status === 'degraded', steps: ['restart_service'], rto: 3, objective: 'fast restart before blast radius grows' },
  { match: (h) => h.status === 'down' && /postgres|database|db-/.test(h.service), steps: ['activate_failover', 'recover_database', 'restore_backup', 'page_oncall'], rto: 15, objective: 'promote replica, point-in-time recovery, zero data loss (RPO 5min)' },
  { match: (h) => h.status === 'down' && /node|worker/.test(h.service), steps: ['recover_node', 'recover_container', 'reroute_traffic'], rto: 8, objective: 'drain and replace node, reschedule pods' },
  { match: (h) => h.status === 'down', steps: ['recover_container', 'restart_service', 'reroute_traffic', 'page_oncall'], rto: 5, objective: 'reschedule container, reroute traffic to healthy replicas' },
];

export class HealingEngine {
  private runs: RecoveryRun[] = [];
  private seq = 0;
  private lastPlanPerService = new Map<string, number>();
  private antiFlapMs = 5 * 60 * 1000;   // don't re-trigger the same runbook constantly
  /** Destructive recoveries (DB restore, node replacement) need approval. */
  requireApprovalFor: RecoveryStep[] = ['restore_backup', 'recover_database', 'recover_node'];

  /** Evaluate health → recovery plan (or null if healthy / anti-flap). */
  evaluate(h: ServiceHealth): RecoveryPlan | null {
    if (h.status === 'healthy') return null;
    const last = this.lastPlanPerService.get(h.service) ?? 0;
    if (Date.now() - last < this.antiFlapMs) return null;
    const runbook = RUNBOOKS.find((r) => r.match(h));
    if (!runbook) return null;
    const needsApproval = runbook.steps.some((s) => this.requireApprovalFor.includes(s));
    return {
      service: h.service,
      trigger: `${h.status}${h.latencyMs ? ` · ${h.latencyMs}ms` : ''}${h.errorRate ? ` · err ${(h.errorRate * 100).toFixed(0)}%` : ''}`,
      steps: runbook.steps,
      objective: runbook.objective,
      mode: needsApproval ? 'approval' : 'auto',
      estimatedRtoMin: runbook.rto,
    };
  }

  /** Execute a plan (auto plans run; approval plans await decide()). */
  execute(plan: RecoveryPlan, approved = false): RecoveryRun {
    const run: RecoveryRun = {
      id: `rec_${++this.seq}`, plan, startedAt: new Date(),
      outcome: plan.mode === 'approval' && !approved ? 'awaiting_approval' : 'recovered',
      stepsDone: plan.mode === 'approval' && !approved ? [] : plan.steps,
    };
    if (run.outcome !== 'awaiting_approval') {
      run.completedAt = new Date();
      this.lastPlanPerService.set(plan.service, Date.now());
    }
    this.runs.push(run);
    return run;
  }

  approve(runId: string): RecoveryRun | undefined {
    const run = this.runs.find((r) => r.id === runId);
    if (!run || run.outcome !== 'awaiting_approval') return undefined;
    run.outcome = 'recovered'; run.stepsDone = run.plan.steps; run.completedAt = new Date();
    this.lastPlanPerService.set(run.plan.service, Date.now());
    return run;
  }

  list(): RecoveryRun[] { return [...this.runs]; }
}
