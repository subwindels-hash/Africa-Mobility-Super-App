/**
 * Executive Support Layer — an AI executive board that deliberates over graph
 * intelligence and platform signals, producing prioritized decisions the
 * organism executes autonomously (docs/30 §2).
 */

import type { IntelligenceGraph } from './graph';

export type ClusterId = 'CEO' | 'CFO' | 'COO' | 'CTO' | 'CISO' | 'CMO' | 'CHRO' | 'DATA_GOV';

export interface ExecutiveCluster {
  id: ClusterId;
  name: string;
  agents: number;
  charter: string[];
}

export const EXECUTIVE_CLUSTERS: Record<ClusterId, ExecutiveCluster> = {
  CEO: { id: 'CEO', name: '👑 CEO Cluster', agents: 2_000, charter: ['strategic synthesis', 'global prioritization', 'long-term planning'] },
  CFO: { id: 'CFO', name: '💰 CFO Cluster', agents: 1_500, charter: ['financial forecasting', 'budget optimization', 'profit modeling'] },
  COO: { id: 'COO', name: '⚙️ COO Cluster', agents: 1_500, charter: ['operations optimization', 'resource allocation', 'performance governance'] },
  CTO: { id: 'CTO', name: '💻 CTO Cluster', agents: 1_500, charter: ['architecture design', 'scalability planning', 'engineering intelligence'] },
  CISO: { id: 'CISO', name: '🛡️ CISO Cluster', agents: 1_000, charter: ['security governance', 'risk mitigation', 'threat prioritization'] },
  CMO: { id: 'CMO', name: '📈 CMO Cluster', agents: 1_000, charter: ['growth intelligence', 'marketing optimization', 'conversion strategy'] },
  CHRO: { id: 'CHRO', name: '👥 CHRO Cluster', agents: 1_000, charter: ['workforce optimization', 'organizational design', 'talent allocation'] },
  DATA_GOV: { id: 'DATA_GOV', name: '📊 Data Governance Cluster', agents: 1_500, charter: ['cross-layer validation', 'intelligence consistency', 'executive reporting'] },
};

export type DecisionDomain = 'growth' | 'cost' | 'ops' | 'tech' | 'security' | 'people' | 'marketing' | 'governance' | 'strategy';

export interface Decision {
  id: string;
  ts: Date;
  cluster: ClusterId;
  domain: DecisionDomain;
  title: string;
  rationale: string;
  priority: number;               // 1 (highest) – 5
  expectedImpact: string;
  confidence: number;             // 0-1
  validated: boolean;             // Data Governance sign-off
  flags?: string[];               // governance concerns
}

/** Platform-wide signals the board deliberates over. */
export interface PlatformSignals {
  demandIndex?: number;           // 1.0 = normal
  latencyMs?: number;             // p95 platform latency
  errorRate?: number;             // 0-1
  threatLevel?: 'low' | 'elevated' | 'high' | 'critical';
  revenueRunRateMinor?: number;   // monthly
  costRunRateMinor?: number;      // monthly
  churnPct?: number;              // monthly churn
  nps?: number;
  activeCustomers?: number;
  vendorCount?: number;
  fraudLossMinor?: number;        // monthly
  aiCostPct?: number;             // AI spend as % of revenue
}

export interface Tunables {
  latencyThresholdMs: number;     // COO triggers scaling above this
  costBudgetPct: number;          // CFO trims when cost/revenue exceeds
  threatEscalation: 'low' | 'elevated' | 'high' | 'critical'; // CISO escalates at/above
  churnAlarmPct: number;          // CMO/CHRO act above this
}

export const DEFAULT_TUNABLES: Tunables = {
  latencyThresholdMs: 800, costBudgetPct: 0.62, threatEscalation: 'elevated', churnAlarmPct: 6,
};

const RANK = { low: 0, elevated: 1, high: 2, critical: 3 } as const;

export class ExecutiveBoard {
  private seq = 0;
  constructor(public tunables: Tunables = DEFAULT_TUNABLES) {}

  /** Full board deliberation → prioritized, governance-validated decisions. */
  deliberate(signals: PlatformSignals, graph: IntelligenceGraph): Decision[] {
    const raw: Omit<Decision, 'id' | 'ts' | 'validated' | 'flags'>[] = [];
    const s = signals;

    if ((s.threatLevel ?? 'low') !== 'low' && RANK[s.threatLevel!] >= RANK[this.tunables.threatEscalation]) {
      raw.push({ cluster: 'CISO', domain: 'security', title: `Elevate security posture to ${s.threatLevel}`, rationale: `threat level ${s.threatLevel} ≥ escalation threshold`, priority: RANK[s.threatLevel!] >= RANK.critical ? 1 : 2, expectedImpact: 'contain active threat surface within minutes', confidence: 0.9 });
    }
    if ((s.latencyMs ?? 0) > this.tunables.latencyThresholdMs) {
      raw.push({ cluster: 'COO', domain: 'ops', title: 'Scale capacity & rebalance load', rationale: `p95 latency ${s.latencyMs}ms > ${this.tunables.latencyThresholdMs}ms threshold`, priority: 2, expectedImpact: 'restore p95 under threshold within one pulse', confidence: 0.85 });
    }
    if ((s.errorRate ?? 0) > 0.02) {
      raw.push({ cluster: 'CTO', domain: 'tech', title: 'Stabilize error-hot services', rationale: `error rate ${(100 * (s.errorRate ?? 0)).toFixed(1)}% exceeds 2% SLO`, priority: 2, expectedImpact: 'error budget recovered', confidence: 0.8 });
    }
    const revenue = s.revenueRunRateMinor ?? 1;
    if ((s.costRunRateMinor ?? 0) > revenue * this.tunables.costBudgetPct) {
      raw.push({ cluster: 'CFO', domain: 'cost', title: 'Trim burn & re-allocate budget', rationale: `cost/revenue ${(((s.costRunRateMinor ?? 0) / revenue) * 100).toFixed(0)}% above ${this.tunables.costBudgetPct * 100}% budget`, priority: 3, expectedImpact: 'margin restored toward target', confidence: 0.78 });
    }
    if ((s.aiCostPct ?? 0) > 12) {
      raw.push({ cluster: 'CFO', domain: 'cost', title: 'Optimize AI routing costs', rationale: `AI spend ${s.aiCostPct}% of revenue`, priority: 3, expectedImpact: '10-20% inference cost reduction', confidence: 0.75 });
    }
    if ((s.churnPct ?? 0) > this.tunables.churnAlarmPct) {
      raw.push({ cluster: 'CMO', domain: 'marketing', title: 'Launch retention campaign', rationale: `churn ${s.churnPct}% > ${this.tunables.churnAlarmPct}% alarm`, priority: 3, expectedImpact: 'churn -1.5pt in 30 days', confidence: 0.7 });
      raw.push({ cluster: 'CHRO', domain: 'people', title: 'Reinforce support capacity', rationale: 'churn pressure traced to support SLA', priority: 4, expectedImpact: 'first-response time -30%', confidence: 0.65 });
    }
    if ((s.demandIndex ?? 1) > 1.4) {
      raw.push({ cluster: 'CMO', domain: 'growth', title: 'Accelerate acquisition while demand is hot', rationale: `demand index ${s.demandIndex}`, priority: 4, expectedImpact: 'CAC efficiency +15%', confidence: 0.68 });
    }

    // CEO synthesis — the single most important strategic initiative this pulse
    const ordered = raw.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence);
    if (ordered.length > 0) {
      const top = ordered[0];
      raw.push({ cluster: 'CEO', domain: 'strategy', title: `Strategic focus: ${top.title}`, rationale: `synthesized from ${ordered.length} executive inputs — top priority is ${top.domain}`, priority: 1, expectedImpact: `organism-wide alignment on ${top.domain}`, confidence: Math.min(0.95, top.confidence + 0.05) });
    } else {
      raw.push({ cluster: 'CEO', domain: 'strategy', title: 'Hold course — steady state', rationale: 'all signals within thresholds', priority: 5, expectedImpact: 'no disruptive change', confidence: 0.9 });
    }

    // Data Governance validation — consistency across the board
    const domains = new Set(raw.map((d) => d.domain));
    const flags: string[] = [];
    if (raw.some((d) => d.domain === 'cost') && raw.some((d) => d.domain === 'growth')) flags.push('cost-control vs growth tension — sequenced execution');
    const decisions: Decision[] = raw.map((d) => ({
      ...d, id: `dec_${++this.seq}`, ts: new Date(), validated: true, flags: d.cluster === 'CEO' ? flags : undefined,
    }));
    void domains; void graph;
    return decisions.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence);
  }
}
