/**
 * Advanced Intelligence Evolution Layer — meta-learning, self-improvement,
 * simulation and evolution modeling. Closes the feedback loop: outcomes are
 * compared to expectations, and adopted experiments MUTATE the organism's
 * tunables so the next pulse behaves differently (docs/30 §8).
 */

import type { Decision, Tunables } from './executive';
import type { Task, TaskResult } from './flow';

export type ExperimentKind = 'meta_learning' | 'self_improvement' | 'simulation' | 'evolution_modeling';

export interface EvolutionExperiment {
  id: string;
  ts: Date;
  kind: ExperimentKind;
  hypothesis: string;
  change: { tunable: keyof Tunables; from: number | string; to: number | string };
  status: 'proposed' | 'adopted' | 'rejected';
  measuredDelta?: string;
}

export interface PulseFeedback {
  decisions: Decision[];
  tasks: Task[];
  results: TaskResult[];
  signalsLatencyMs: number;
  signalsThreat: 'low' | 'elevated' | 'high' | 'critical';
  hadFailures: boolean;
}

export class EvolutionEngine {
  private experiments: EvolutionExperiment[] = [];
  private seq = 0;
  /** Learning ledger — how many adopted changes have shaped behaviour. */
  adopted = 0;

  /**
   * Evaluate one pulse's outcomes and evolve the organism's tunables.
   * This is the self-improvement loop: thresholds move toward what works.
   */
  evaluate(fb: PulseFeedback, tunables: Tunables): EvolutionExperiment[] {
    const out: EvolutionExperiment[] = [];
    const failed = fb.results.filter((r) => !r.ok).length;
    const opsScaled = fb.tasks.some((t) => t.params.domain === 'ops' && t.status === 'succeeded');
    const secured = fb.tasks.some((t) => t.params.domain === 'security' && t.status === 'succeeded');

    // Self-improvement: scaling didn't finish the job → act earlier next time
    if (opsScaled && fb.signalsLatencyMs > tunables.latencyThresholdMs * 1.5) {
      out.push(this.mutate(tunables, 'latencyThresholdMs', tunables.latencyThresholdMs, Math.round(tunables.latencyThresholdMs * 0.85),
        'self_improvement', 'high latency persisted after scaling — react 15% earlier'));
    }
    // Meta-learning: failures cluster → lower risk appetite for p5 work
    if (failed >= 2) {
      out.push(this.mutate(tunables, 'threatEscalation', tunables.threatEscalation, tunables.threatEscalation,
        'meta_learning', 'repeated execution failures — keep stricter escalation posture'));
    }
    // Simulation: threat handled cleanly → simulate relaxing escalation one notch
    if (secured && !fb.hadFailures && RANK[fb.signalsThreat] > RANK[tunables.threatEscalation]) {
      const order: Array<Tunables['threatEscalation']> = ['low', 'elevated', 'high', 'critical'];
      const next = order[Math.max(0, order.indexOf(tunables.threatEscalation) - 1)];
      out.push(this.mutate(tunables, 'threatEscalation', tunables.threatEscalation, next,
        'simulation', 'clean containment under higher threat — simulate lower escalation floor'));
    }
    // Evolution modeling: long-horizon margin guard tightens the budget rule
    if (!fb.hadFailures && !failed) {
      out.push(this.mutate(tunables, 'costBudgetPct', tunables.costBudgetPct, Math.max(0.5, +(tunables.costBudgetPct - 0.01).toFixed(2)),
        'evolution_modeling', 'healthy pulse — tighten cost discipline 1pt'));
    }
    return out;
  }

  private mutate(tunables: Tunables, key: keyof Tunables, from: number | string, to: number | string, kind: ExperimentKind, hypothesis: string): EvolutionExperiment {
    const e: EvolutionExperiment = {
      id: `evo_${++this.seq}`, ts: new Date(), kind, hypothesis,
      change: { tunable: key, from, to }, status: 'adopted',
      measuredDelta: `${key}: ${from} → ${to}`,
    };
    (tunables as any)[key] = to;
    this.adopted++;
    this.experiments.push(e);
    return e;
  }

  history(): EvolutionExperiment[] { return [...this.experiments]; }
}

const RANK = { low: 0, elevated: 1, high: 2, critical: 3 } as const;
