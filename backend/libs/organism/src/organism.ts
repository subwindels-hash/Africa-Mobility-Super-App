/**
 * The Organism — unified cognitive architecture orchestrating the full
 * intelligence flow every pulse:
 *
 *   1. data generated across modules →
 *   2. Data Analysis Swarm derives intelligence (graph) →
 *   3. Executive Layer deliberates decisions →
 *   4. Orchestration Layer distributes tasks →
 *   5. Execution Layer acts →
 *   6. Security & Infrastructure ensure stability (SHIELD / docs/29) →
 *   7. Evolution Layer improves the organism continuously (feedback loop)
 */

import { LAYERS, TOTAL_AGENTS, fleetSummary, type LayerId } from './layers';
import { IntelligenceGraph, type NodeKind } from './graph';
import { ExecutiveBoard, DEFAULT_TUNABLES, EXECUTIVE_CLUSTERS, type PlatformSignals, type Decision, type Tunables } from './executive';
import { Orchestrator, ExecutionLayer, type Task, type TaskResult } from './flow';
import { EvolutionEngine, type EvolutionExperiment } from './evolution';

export interface PulseReport {
  pulseId: string;
  ts: Date;
  durationMs: number;
  agents: number;
  signals: PlatformSignals;
  observations: number;
  decisions: Decision[];
  tasks: Task[];
  results: TaskResult[];
  experiments: EvolutionExperiment[];
  graph: ReturnType<IntelligenceGraph['stats']>;
  tunablesAfter: Tunables;
}

export class Organism {
  readonly graph = new IntelligenceGraph();
  readonly board: ExecutiveBoard;
  readonly orchestrator = new Orchestrator();
  readonly executor = new ExecutionLayer();
  readonly evolution = new EvolutionEngine();
  readonly tunables: Tunables;
  private pulses: PulseReport[] = [];
  private seq = 0;

  constructor(tunables: Tunables = DEFAULT_TUNABLES) {
    this.tunables = { ...tunables };            // clone — evolution mutates per-organism, never the baseline
    this.board = new ExecutiveBoard(this.tunables);
  }

  /**
   * One full cognition cycle over the platform's live signals.
   * The security layer (SHIELD) runs in parallel in the API process; its
   * posture is accepted via signals.threatLevel.
   */
  pulse(signals: PlatformSignals): PulseReport {
    const t0 = Date.now();

    // 1–2. Data Analysis layer derives intelligence into the shared graph
    const layer = LAYERS.data_analysis;
    const facts: { node: string; signal: string; direction: 'up' | 'down' | 'flat' }[] = [
      { node: 'kpi:demand', signal: `demand index ${signals.demandIndex ?? 1}`, direction: (signals.demandIndex ?? 1) > 1.2 ? 'up' : 'flat' },
      { node: 'kpi:latency', signal: `p95 ${signals.latencyMs ?? 300}ms`, direction: (signals.latencyMs ?? 0) > this.tunables.latencyThresholdMs ? 'up' : 'flat' },
      { node: 'kpi:errors', signal: `error rate ${((signals.errorRate ?? 0) * 100).toFixed(2)}%`, direction: (signals.errorRate ?? 0) > 0.02 ? 'up' : 'flat' },
      { node: 'threat:platform', signal: `threat level ${signals.threatLevel ?? 'low'}`, direction: (signals.threatLevel ?? 'low') !== 'low' ? 'up' : 'flat' },
      { node: 'kpi:margin', signal: `cost/revenue ${signals.revenueRunRateMinor ? (((signals.costRunRateMinor ?? 0) / signals.revenueRunRateMinor) * 100).toFixed(0) : '?'}%`, direction: 'flat' },
      { node: 'kpi:churn', signal: `churn ${signals.churnPct ?? 2}%`, direction: (signals.churnPct ?? 0) > this.tunables.churnAlarmPct ? 'up' : 'flat' },
    ];
    let i = 0;
    for (const swarm of layer.subSwarms) {
      const f = facts[i % facts.length];
      this.graph.observe({ layer: 'data_analysis', subSwarm: swarm.id, node: f.node, signal: f.signal, confidence: 0.8 + (i % 3) * 0.05, direction: f.direction });
      i++;
    }

    // 3. Executive deliberation
    const decisions = this.board.deliberate(signals, this.graph);

    // 4. Orchestration distributes & resolves conflicts
    const tasks = this.orchestrator.plan(decisions);

    // 5. Execution
    const results = this.executor.run(tasks);

    // 6. Security/infra stability — reflected via signals into decisions above;
    //    SHIELD (docs/29) executes the defensive actions in parallel.

    // 7. Evolution feedback loop mutates tunables for the NEXT pulse
    const experiments = this.evolution.evaluate(
      { decisions, tasks, results, signalsLatencyMs: signals.latencyMs ?? 0, signalsThreat: signals.threatLevel ?? 'low', hadFailures: results.some((r) => !r.ok) },
      this.tunables,
    );

    const report: PulseReport = {
      pulseId: `pulse_${++this.seq}`, ts: new Date(), durationMs: Date.now() - t0,
      agents: TOTAL_AGENTS, signals, observations: layer.subSwarms.length,
      decisions, tasks, results, experiments, graph: this.graph.stats(), tunablesAfter: { ...this.tunables },
    };
    this.pulses.push(report);
    return report;
  }

  state() {
    const last = this.pulses.at(-1);
    return {
      architecture: 'distributed autonomous enterprise intelligence organism',
      principles: [
        'every agent is a specialized intelligence node',
        'agents contribute to a shared real-time intelligence graph',
        'continuous learning from system feedback',
        'participation in global decision loops',
        'self-optimization of itself and surrounding systems',
      ],
      agents: TOTAL_AGENTS,
      layers: fleetSummary(),
      layerDetail: LAYERS,
      executive: EXECUTIVE_CLUSTERS,
      tunables: this.tunables,
      evolution: { adopted: this.evolution.adopted, history: this.evolution.history().slice(-10) },
      graph: this.graph.stats(),
      pulses: this.pulses.length,
      lastPulse: last ? { id: last.pulseId, decisions: last.decisions.length, tasks: last.tasks.length, experiments: last.experiments.length } : null,
      autonomy: 'near-zero human dependency — humans set guardrails (FAMS, SHIELD approvals), the organism runs the loop',
    };
  }

  history(): PulseReport[] { return [...this.pulses]; }
}

/** Process-wide singleton (agent mesh across the cluster in production). */
export const organism = new Organism();

export type { NodeKind, LayerId };
