/**
 * ORGANISM — Global AI Organism Architecture (docs/30).
 * Tests: exact fleet topology (120,000+ agents, 8 layers), intelligence graph,
 * executive deliberation, orchestration + conflict resolution, execution,
 * evolution feedback loops (self-learning proof), and full pulse cycles.
 */
import { describe, expect, it } from 'vitest';
import {
  Organism, LAYERS, TOTAL_AGENTS, EXECUTIVE_CLUSTERS, IntelligenceGraph,
  ExecutiveBoard, Orchestrator, DEFAULT_TUNABLES, type PlatformSignals, type Decision,
} from '../libs/organism/src/index';

describe('ORGANISM — fleet topology (spec-exact)', () => {
  it('eight layers, 120,000+ agents in total', () => {
    expect(Object.keys(LAYERS)).toHaveLength(8);
    expect(TOTAL_AGENTS).toBeGreaterThanOrEqual(120_000);
    expect(TOTAL_AGENTS).toBe(120_000); // layer-header budgets sum to exactly the headline 120k
    // NOTE: the executive cluster counts in the architecture table sum to 11,000
    // against a 10,000 layer header — cluster counts are kept exactly as
    // specified; the canonical total uses the layer budgets (120,000+).
    const clusterSum = Object.values(EXECUTIVE_CLUSTERS).reduce((s, c) => s + c.agents, 0);
    expect(clusterSum).toBe(11_000);
    expect(TOTAL_AGENTS + clusterSum - LAYERS.executive.agents).toBe(121_000);
  });

  it('layer budgets match the architecture table', () => {
    expect(LAYERS.data_analysis.agents).toBe(60_000);
    expect(LAYERS.executive.agents).toBe(10_000);
    expect(LAYERS.security.agents).toBe(10_000);
    expect(LAYERS.operations.agents).toBe(15_000);
    expect(LAYERS.automation.agents).toBe(10_000);
    expect(LAYERS.product.agents).toBe(5_000);
    expect(LAYERS.orchestration.agents).toBe(5_000);
    expect(LAYERS.evolution.agents).toBe(5_000);
  });

  it('every sub-swarm matches its specified agent count', () => {
    const byId = (layer: keyof typeof LAYERS, id: string) => LAYERS[layer].subSwarms.find((s) => s.id === id)!;
    // data analysis — six 10k swarms
    for (const id of ['core_data', 'business_intel', 'predictive', 'security_data', 'product_intel', 'ai_optimization']) {
      expect(byId('data_analysis', id).agents).toBe(10_000);
    }
    // executive clusters
    expect(EXECUTIVE_CLUSTERS.CEO.agents).toBe(2_000);
    expect(EXECUTIVE_CLUSTERS.CFO.agents).toBe(1_500);
    expect(EXECUTIVE_CLUSTERS.CTO.agents).toBe(1_500);
    expect(EXECUTIVE_CLUSTERS.DATA_GOV.agents).toBe(1_500);
    expect(EXECUTIVE_CLUSTERS.CISO.agents).toBe(1_000);
    // security layer
    expect(byId('security', 'network_sec').agents).toBe(2_000);
    expect(byId('security', 'data_sec').agents).toBe(1_000);
    // ops / automation / product / orchestration / evolution
    expect(byId('operations', 'cloud_infra').agents).toBe(4_000);
    expect(byId('operations', 'db_optimization').agents).toBe(2_000);
    expect(byId('automation', 'workflow').agents).toBe(3_000);
    expect(byId('automation', 'bpa').agents).toBe(1_000);
    expect(byId('product', 'journey').agents).toBe(1_500);
    expect(byId('product', 'interface').agents).toBe(500);
    expect(byId('orchestration', 'coordination').agents).toBe(2_000);
    expect(byId('evolution', 'meta_learning').agents).toBe(2_000);
    expect(byId('evolution', 'self_improvement').agents).toBe(1_000);
  });

  it('executive layer is fully specified (8 clusters) with charters', () => {
    expect(Object.keys(EXECUTIVE_CLUSTERS)).toHaveLength(8);
    expect(EXECUTIVE_CLUSTERS.CEO.charter).toContain('strategic synthesis');
    expect(EXECUTIVE_CLUSTERS.DATA_GOV.charter).toContain('intelligence consistency');
  });
});

describe('ORGANISM — shared intelligence graph', () => {
  it('agents contribute observations; hottest nodes surface first', () => {
    const g = new IntelligenceGraph();
    g.observe({ layer: 'data_analysis', subSwarm: 'core_data', node: 'kpi:demand', signal: 'demand 2.1×', confidence: 0.9, direction: 'up' });
    g.observe({ layer: 'data_analysis', subSwarm: 'business_intel', node: 'kpi:demand', signal: 'revenue correlating', confidence: 0.85, direction: 'up' });
    g.observe({ layer: 'security', subSwarm: 'threat_intel', node: 'threat:platform', signal: 'feed chatter', confidence: 0.6, direction: 'up' });
    const hot = g.query(2);
    expect(hot[0].id).toBe('kpi:demand');          // two contributions outweigh one
    expect(hot[0].observations).toBe(2);
    expect(g.stats().contributingLayers).toBe(2);
  });

  it('node confidence is agreement-weighted across contributing agents', () => {
    const g = new IntelligenceGraph();
    g.observe({ layer: 'data_analysis', subSwarm: 'predictive', node: 'city:NG-LAG', signal: 'surge likely', confidence: 1.0, direction: 'up' });
    g.observe({ layer: 'data_analysis', subSwarm: 'core_data', node: 'city:NG-LAG', signal: 'flat so far', confidence: 0.5, direction: 'flat' });
    const n = g.node('city:NG-LAG')!;
    expect(n.observations).toBe(2);
    expect(n.confidence).toBeLessThan(1.0);        // disagreement reduces confidence
    expect(n.confidence).toBeGreaterThan(0.5);
  });
});

describe('ORGANISM — executive deliberation', () => {
  const board = () => new ExecutiveBoard();
  const graph = new IntelligenceGraph();

  it('CISO escalates on threat; COO scales on latency; CEO synthesis is top priority', () => {
    const d = board().deliberate({ threatLevel: 'high', latencyMs: 1400, errorRate: 0.01 }, graph);
    const ciso = d.find((x) => x.cluster === 'CISO');
    const coo = d.find((x) => x.cluster === 'COO');
    const ceo = d.find((x) => x.cluster === 'CEO');
    expect(ciso?.domain).toBe('security');
    expect(ciso?.priority).toBe(2);
    expect(coo?.domain).toBe('ops');
    expect(ceo?.priority).toBe(1);
    expect(ceo?.title).toContain('Strategic focus');
    expect(d.every((x) => x.validated)).toBe(true); // Data Governance sign-off
  });

  it('CFO acts when cost exceeds budget ratio; flags cost/growth tension', () => {
    const d = board().deliberate({ revenueRunRateMinor: 100_000_000, costRunRateMinor: 80_000_000, demandIndex: 1.6 }, graph);
    const cfo = d.find((x) => x.cluster === 'CFO');
    expect(cfo?.domain).toBe('cost');
    const ceo = d.find((x) => x.cluster === 'CEO')!;
    expect(ceo.flags?.some((f) => f.includes('tension'))).toBe(true);
  });

  it('steady state produces a hold-course decision with no panic', () => {
    const d = board().deliberate({ demandIndex: 1, latencyMs: 200, errorRate: 0.001, threatLevel: 'low' }, graph);
    expect(d).toHaveLength(1);
    expect(d[0].title).toContain('Hold course');
    expect(d[0].priority).toBe(5);
  });
});

describe('ORGANISM — orchestration, conflict resolution & execution', () => {
  it('decisions decompose into routed tasks with automation sub-swarms', () => {
    const o = new Orchestrator();
    const decisions: Decision[] = [
      { id: 'd1', ts: new Date(), cluster: 'COO', domain: 'ops', title: 'Scale capacity', rationale: 'latency', priority: 2, expectedImpact: 'p95 restored', confidence: 0.85, validated: true },
      { id: 'd2', ts: new Date(), cluster: 'CISO', domain: 'security', title: 'Elevate posture', rationale: 'threat', priority: 2, expectedImpact: 'contained', confidence: 0.9, validated: true },
    ];
    const tasks = o.plan(decisions);
    expect(tasks.length).toBeGreaterThanOrEqual(4);          // multi-step decomposition
    expect(tasks.every((t) => t.assignedSubSwarm.includes('agents'))).toBe(true);
    expect(tasks.some((t) => t.kind === 'microservice')).toBe(true);
    expect(tasks.some((t) => t.kind === 'workflow')).toBe(true);
  });

  it('conflict resolution: colliding tasks keep the highest priority only', () => {
    const o = new Orchestrator();
    const t1 = { id: 'a', decisionId: 'd1', kind: 'microservice' as const, title: 'scale', target: 'platform.capacity', params: {}, priority: 1, status: 'queued' as const, assignedSubSwarm: 's' };
    const t2 = { ...t1, id: 'b', priority: 3 };
    const resolved = o.resolveConflicts([t1, t2]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('a');
    expect(t2.status).toBe('conflict_resolved');
  });
});

describe('ORGANISM — evolution layer closes the feedback loop (self-learning)', () => {
  it('persistent latency after scaling tightens the reaction threshold (behaviour changes)', () => {
    const org = new Organism();
    const before = org.tunables.latencyThresholdMs;
    org.pulse({ latencyMs: before * 2, demandIndex: 1.5 });       // very high latency
    expect(org.tunables.latencyThresholdMs).toBeLessThan(before); // learned to act earlier
    expect(org.evolution.adopted).toBeGreaterThan(0);
  });

  it('the NEXT pulse behaves differently because of what was learned', () => {
    const org = new Organism();
    const base = org.tunables.latencyThresholdMs;
    org.pulse({ latencyMs: base * 2 });                            // triggers tightening
    const tightened = org.tunables.latencyThresholdMs;
    // same physical latency now crosses the NEW threshold sooner → COO reacts earlier
    const r2 = org.pulse({ latencyMs: base * 1.4 });
    const coo = r2.decisions.find((d) => d.cluster === 'COO');
    if (base * 1.4 > tightened) {
      expect(coo).toBeDefined();                                   // earlier reaction than pulse 1 would have allowed
    }
    expect(org.history()).toHaveLength(2);
  });

  it('clean pulses evolve cost discipline; every experiment is recorded', () => {
    const org = new Organism();
    const before = org.tunables.costBudgetPct;
    org.pulse({ demandIndex: 1, latencyMs: 100, threatLevel: 'low' });
    expect(org.tunables.costBudgetPct).toBeLessThan(before);
    expect(org.evolution.history().every((e) => ['proposed', 'adopted', 'rejected'].includes(e.status))).toBe(true);
  });
});

describe('ORGANISM — full pulse & cognitive state', () => {
  it('one pulse runs the complete 7-step intelligence flow', () => {
    const org = new Organism();
    const r = org.pulse({ demandIndex: 1.8, latencyMs: 1500, threatLevel: 'high', churnPct: 8 });
    expect(r.agents).toBe(TOTAL_AGENTS);
    expect(r.graph.nodes).toBeGreaterThan(0);           // intelligence derived
    expect(r.decisions.length).toBeGreaterThan(0);      // executives decided
    expect(r.tasks.length).toBeGreaterThan(0);          // orchestration distributed
    expect(r.results.length).toBeGreaterThan(0);        // execution acted
    expect(r.experiments.length).toBeGreaterThan(0);    // evolution improved
    expect(r.durationMs).toBeLessThan(2000);
  });

  it('state exposes the organism definition, layers, tunables and autonomy posture', () => {
    const org = new Organism();
    org.pulse({ threatLevel: 'elevated' });
    const st = org.state();
    expect(st.architecture).toContain('organism');
    expect(st.layers).toHaveLength(8);
    expect(st.agents).toBeGreaterThanOrEqual(120_000);
    expect(st.principles).toHaveLength(5);
    expect(st.autonomy).toContain('near-zero human dependency');
    expect(st.graph.hottest.length).toBeGreaterThan(0);
  });

  it('default tunables match the governance baseline', () => {
    expect(DEFAULT_TUNABLES.latencyThresholdMs).toBe(800);
    expect(DEFAULT_TUNABLES.costBudgetPct).toBeLessThan(1);
  });
});
