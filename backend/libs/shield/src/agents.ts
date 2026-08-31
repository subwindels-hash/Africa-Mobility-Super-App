/**
 * SHIELD — Autonomous Cybersecurity, Threat Intelligence & Platform Defense
 * Swarm (docs/29).
 *
 * A distributed fleet of specialized AI security agents that continuously
 * protects the whole AMSA ecosystem: network, applications, infrastructure,
 * identity, data, threat intel, fraud and data-intelligence.
 *
 * The swarm elastically scales from hundreds to thousands of concurrent
 * agents driven by demand / infrastructure size / transaction volume /
 * threat level / geography / vendor growth / customer activity / workload.
 */

export type AgentKind =
  | 'network' | 'application' | 'infrastructure' | 'identity' | 'data'
  | 'threat_intel' | 'fraud' | 'data_intelligence';

export interface AgentSpec {
  kind: AgentKind;
  name: string;
  monitors: string[];        // surfaces watched (spec lists)
  capabilities: string[];    // detection/response abilities (spec lists)
  baseAgents: number;        // floor at rest
}

/** The eight agent families from the specification. */
export const AGENT_TAXONOMY: Record<AgentKind, AgentSpec> = {
  network: {
    kind: 'network', name: 'Network Security Agents', baseAgents: 40,
    monitors: [
      'internal networks', 'external traffic', 'VPN connections', 'API traffic', 'cloud networking',
      'service-to-service communication', 'WebSocket traffic', 'mobile application traffic',
      'third-party integrations', 'payment gateways', 'WhatsApp Business API connections',
    ],
    capabilities: ['network anomaly detection', 'intrusion detection', 'traffic inspection', 'DDoS detection', 'bot mitigation', 'threat correlation'],
  },
  application: {
    kind: 'application', name: 'Application Security Agents', baseAgents: 35,
    monitors: [
      'customer mobile app', 'customer web portal', 'WhatsApp AI platform', 'vendor dashboard',
      'fleet dashboard', 'security provider dashboard', 'travel agency dashboard', 'admin dashboard',
      'super admin dashboard', 'corporate portal', 'APIs', 'frontend services', 'backend services',
      'microservices', 'webhooks',
    ],
    capabilities: ['vulnerability detection', 'security validation', 'runtime protection', 'API abuse detection', 'session monitoring'],
  },
  infrastructure: {
    kind: 'infrastructure', name: 'Infrastructure Security Agents', baseAgents: 30,
    monitors: [
      'AWS infrastructure', 'Kubernetes clusters', 'containers', 'virtual machines', 'databases',
      'Redis clusters', 'object storage (S3)', 'load balancers', 'CDN', 'backup systems',
      'disaster recovery infrastructure',
    ],
    capabilities: ['misconfiguration detection', 'infrastructure hardening', 'security posture assessment', 'resource protection'],
  },
  identity: {
    kind: 'identity', name: 'Identity Security Agents', baseAgents: 25,
    monitors: [
      'user authentication', 'vendor authentication', 'driver authentication', 'corporate authentication',
      'MFA events', 'session activity', 'access violations', 'privilege escalation attempts',
      'device fingerprints', 'account recovery requests',
    ],
    capabilities: ['identity protection', 'session validation', 'account takeover detection', 'credential abuse detection'],
  },
  data: {
    kind: 'data', name: 'Data Security Agents', baseAgents: 25,
    monitors: [
      'customer data', 'vendor data', 'financial data', 'payment data', 'escrow data',
      'booking data', 'corporate data', 'analytics data', 'AI training data',
    ],
    capabilities: ['data classification', 'encryption verification', 'data leakage prevention', 'access monitoring', 'data governance enforcement'],
  },
  threat_intel: {
    kind: 'threat_intel', name: 'Threat Intelligence Agents', baseAgents: 15,
    monitors: [
      'emerging threats', 'vulnerability databases', 'threat feeds', 'security advisories',
      'attack campaigns', 'indicators of compromise', 'industry intelligence',
    ],
    capabilities: ['threat correlation', 'risk analysis', 'threat prediction', 'security recommendations'],
  },
  fraud: {
    kind: 'fraud', name: 'Fraud Detection & Trust Agents', baseAgents: 20,
    monitors: [
      'ride bookings', 'dispatch bookings', 'vendor activity', 'wallet transactions', 'escrow transactions',
      'corporate transactions', 'refund requests', 'promotional abuse', 'referral abuse', 'identity fraud',
    ],
    capabilities: ['fraud detection', 'trust scoring', 'abuse prevention', 'loss prevention'],
  },
  data_intelligence: {
    kind: 'data_intelligence', name: 'Data Intelligence Agents', baseAgents: 15,
    monitors: [
      'platform performance', 'customer behavior', 'vendor performance', 'revenue trends',
      'geographic demand', 'capacity utilization', 'driver activity', 'dispatch efficiency',
      'travel demand', 'security service demand',
    ],
    capabilities: ['predictive analytics', 'business intelligence', 'demand forecasting', 'capacity planning', 'cost optimization', 'revenue optimization'],
  },
};

/** Workload signals that drive elastic swarm size. */
export interface SwarmSignals {
  demandIndex?: number;            // 1.0 = normal platform demand
  infrastructureSize?: number;     // nodes/instances count
  transactionsPerMin?: number;     // bookings + payments
  threatLevel?: 'low' | 'elevated' | 'high' | 'critical';
  countries?: number;              // geographic expansion
  vendors?: number;                // vendor growth
  activeCustomers?: number;
}

type ThreatLevel = NonNullable<SwarmSignals['threatLevel']>;
const THREAT_MULTIPLIER: Record<ThreatLevel, number> = { low: 1, elevated: 1.35, high: 1.8, critical: 2.5 };

/** Deterministic agent count per family for the current workload. */
export function planSwarm(signals: SwarmSignals): Record<AgentKind, number> {
  const {
    demandIndex = 1, infrastructureSize = 12, transactionsPerMin = 900,
    threatLevel = 'low', countries = 1, vendors = 500, activeCustomers = 50_000,
  } = signals;

  const load = Math.max(0.5, demandIndex);
  const scale = (extra: number) => extra; // compose below
  const threat = THREAT_MULTIPLIER[threatLevel];
  const geo = 1 + (countries - 1) * 0.15;
  const fleet = 1 + Math.min(1, vendors / 5_000);
  const crowd = 1 + Math.min(1, activeCustomers / 500_000);
  const tx = 1 + Math.min(1.5, transactionsPerMin / 10_000);

  const out = {} as Record<AgentKind, number>;
  for (const spec of Object.values(AGENT_TAXONOMY)) {
    let n = spec.baseAgents * load * threat * geo * crowd;
    if (spec.kind === 'network') n *= tx;
    if (spec.kind === 'application') n *= tx * fleet;
    if (spec.kind === 'infrastructure') n *= 1 + Math.min(2, infrastructureSize / 40);
    if (spec.kind === 'fraud') n *= tx * fleet;
    if (spec.kind === 'data_intelligence') n *= Math.max(1, demandIndex);
    out[spec.kind] = Math.max(spec.baseAgents, Math.round(n / 5) * 5);
  }
  return out;
}

export interface AgentHandle { id: string; kind: AgentKind; startedAt: Date; checks: number; findings: number }

/** Running fleet with heartbeats — Redis registry + K8s HPA in production. */
export class AgentSwarm {
  private agents = new Map<string, AgentHandle>();
  private seq = 0;
  private signals: SwarmSignals = {};
  private lastPlan: Partial<Record<AgentKind, number>> = {};

  /** (Re)plan and deploy the fleet for the given workload. */
  scale(signals: SwarmSignals): { planned: Record<AgentKind, number>; total: number } {
    this.signals = signals;
    const plan = planSwarm(signals);
    this.lastPlan = plan;
    return this.deploy(plan);
  }

  private deploy(plan: Record<AgentKind, number>): { planned: Record<AgentKind, number>; total: number } {
    for (const [kind, count] of Object.entries(plan) as [AgentKind, number][]) {
      const have = [...this.agents.values()].filter((a) => a.kind === kind).length;
      for (let i = have; i < count; i++) {
        const id = `agt_${kind[0]}${++this.seq}`;
        this.agents.set(id, { id, kind, startedAt: new Date(), checks: 0, findings: 0 });
      }
      if (have > count) { // scale in — retire newest first
        const mine = [...this.agents.values()].filter((a) => a.kind === kind).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
        for (const a of mine.slice(0, have - count)) this.agents.delete(a.id);
      }
    }
    return { planned: plan, total: this.agents.size };
  }

  heartbeat(agentId: string, finding = false): void {
    const a = this.agents.get(agentId);
    if (!a) return;
    a.checks++;
    if (finding) a.findings++;
  }

  status() {
    const byKind = {} as Record<AgentKind, { agents: number; checks: number; findings: number }>;
    for (const a of this.agents.values()) {
      const k = (byKind[a.kind] ??= { agents: 0, checks: 0, findings: 0 });
      k.agents++; k.checks += a.checks; k.findings += a.findings;
    }
    return {
      totalAgents: this.agents.size,
      byKind,
      signals: this.signals,
      health: this.agents.size > 0 ? 'operational' : 'standby',
      taxonomy: AGENT_TAXONOMY,
    };
  }
}
