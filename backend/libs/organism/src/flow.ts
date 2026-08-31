/**
 * Orchestration & Coordination Layer + Automation & Execution Layer —
 * the central nervous system that turns executive decisions into routed,
 * conflict-resolved, executed tasks (docs/30 §5, §7).
 */

import type { Decision } from './executive';

export type TaskKind = 'workflow' | 'communication' | 'task' | 'microservice' | 'business_process';

export interface Task {
  id: string;
  decisionId: string;
  kind: TaskKind;
  title: string;
  target: string;                 // service / campaign / system acted on
  params: Record<string, unknown>;
  priority: number;
  status: 'queued' | 'conflict_resolved' | 'succeeded' | 'failed';
  assignedSubSwarm: string;
}

export interface TaskResult {
  taskId: string;
  ok: boolean;
  durationMs: number;
  effect: string;
}

const DOMAIN_KINDS: Record<string, TaskKind[]> = {
  ops: ['microservice', 'workflow'],
  tech: ['microservice', 'task'],
  security: ['workflow', 'task'],
  cost: ['business_process', 'task'],
  growth: ['communication', 'business_process'],
  marketing: ['communication', 'workflow'],
  people: ['business_process'],
  governance: ['task'],
  strategy: ['workflow'],
};

const SUB_SWARM_FOR: Record<TaskKind, string> = {
  workflow: 'workflow (3,000 agents)',
  communication: 'comms (2,000 agents)',
  task: 'task-exec (2,000 agents)',
  microservice: 'microservice (2,000 agents)',
  business_process: 'bpa (1,000 agents)',
};

export class Orchestrator {
  private seq = 0;

  /** Decompose decisions into executable tasks routed to automation agents. */
  plan(decisions: Decision[]): Task[] {
    const tasks: Task[] = [];
    for (const d of decisions) {
      const kinds = DOMAIN_KINDS[d.domain] ?? ['task'];
      kinds.forEach((kind, i) => {
        tasks.push({
          id: `tsk_${++this.seq}`, decisionId: d.id, kind,
          title: `${d.title} — ${kind.replace('_', ' ')} step ${i + 1}`,
          target: this.targetFor(d), params: { domain: d.domain, confidence: d.confidence },
          priority: d.priority, status: 'queued', assignedSubSwarm: SUB_SWARM_FOR[kind],
        });
      });
    }
    return this.resolveConflicts(tasks);
  }

  /** Conflict resolution — same target keeps only the highest-priority task. */
  resolveConflicts(tasks: Task[]): Task[] {
    const byTarget = new Map<string, Task[]>();
    for (const t of tasks) {
      const k = `${t.target}:${t.kind}`;
      byTarget.set(k, [...(byTarget.get(k) ?? []), t]);
    }
    const out: Task[] = [];
    for (const group of byTarget.values()) {
      group.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
      out.push(group[0]);
      for (const loser of group.slice(1)) loser.status = 'conflict_resolved';
    }
    return out;
  }

  private targetFor(d: Decision): string {
    switch (d.domain) {
      case 'ops': return 'platform.capacity';
      case 'tech': return 'platform.stability';
      case 'security': return 'platform.defense';
      case 'cost': return 'platform.budget';
      case 'growth': case 'marketing': return 'growth.engine';
      case 'people': return 'org.support';
      default: return 'organism.alignment';
    }
  }
}

export class ExecutionLayer {
  private results: TaskResult[] = [];

  /** Execute queued tasks (idempotent retries + observability in production). */
  run(tasks: Task[]): TaskResult[] {
    const out: TaskResult[] = [];
    for (const t of tasks) {
      if (t.status !== 'queued') continue;
      // deterministic execution model: strategy/governance tasks are advisory,
      // everything else succeeds; failures surface through the evolution loop
      const advisory = t.params.domain === 'strategy' || t.params.domain === 'governance';
      const ok = advisory ? true : (t.priority < 5);
      t.status = ok ? 'succeeded' : 'failed';
      const r: TaskResult = {
        taskId: t.id, ok,
        durationMs: 50 + Math.round(Math.random() * 450),
        effect: ok ? `${t.title} applied` : `${t.title} needs human review (p5)`,
      };
      out.push(r);
      this.results.push(r);
    }
    return out;
  }

  history(): TaskResult[] { return [...this.results]; }
}
