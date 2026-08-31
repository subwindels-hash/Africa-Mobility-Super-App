/**
 * Shared Real-Time Intelligence Graph — every agent contributes observations;
 * the graph aggregates them into weighted knowledge nodes the whole organism
 * reads from (the cognitive substrate of docs/30).
 */

import type { LayerId } from './layers';

export type NodeKind =
  | 'service' | 'city' | 'vertical' | 'customer' | 'vendor' | 'payment'
  | 'threat' | 'infrastructure' | 'model' | 'kpi';

export interface GraphNode {
  id: string;                     // e.g. 'service:booking-svc', 'city:NG-LAG'
  kind: NodeKind;
  label: string;
  weight: number;                 // aggregated importance (decays without signal)
  confidence: number;             // 0-1 agreement across contributing agents
  observations: number;
  lastSeen: Date;
}

export interface Observation {
  id: string;
  ts: Date;
  layer: LayerId;
  subSwarm: string;
  node: string;                   // node id
  signal: string;                 // what was observed
  confidence: number;             // 0-1
  direction: 'up' | 'down' | 'flat';
  payload?: Record<string, unknown>;
}

const DECAY_MS = 30 * 60 * 1000;  // weights halve after 30 quiet minutes

export class IntelligenceGraph {
  private nodes = new Map<string, GraphNode>();
  private observations: Observation[] = [];
  private seq = 0;

  /** An agent contributes an observation; the graph learns from it. */
  observe(o: Omit<Observation, 'id' | 'ts'> & { ts?: Date }): Observation {
    const obs: Observation = { ...o, id: `obs_${++this.seq}`, ts: o.ts ?? new Date() };
    this.observations.push(obs);

    const existing = this.nodes.get(obs.node);
    if (existing) {
      const agreement = existing.confidence * existing.observations + obs.confidence;
      existing.observations += 1;
      existing.confidence = Math.min(1, agreement / existing.observations);
      // recency-weighted importance
      const freshness = 1 + 1 / (1 + (Date.now() - existing.lastSeen.getTime()) / DECAY_MS);
      existing.weight = existing.weight * 0.85 + obs.confidence * freshness * (obs.direction === 'up' ? 1.2 : obs.direction === 'down' ? 1.1 : 0.8);
      existing.lastSeen = obs.ts;
    } else {
      this.nodes.set(obs.node, {
        id: obs.node, kind: this.kindOf(obs.node), label: obs.node.split(':').slice(1).join(':') || obs.node,
        weight: obs.confidence, confidence: obs.confidence, observations: 1, lastSeen: obs.ts,
      });
    }
    return obs;
  }

  /** Hottest nodes — what the organism is thinking about right now. */
  query(top = 10): GraphNode[] {
    return [...this.nodes.values()].sort((a, b) => b.weight - a.weight).slice(0, top);
  }

  node(id: string): GraphNode | undefined { return this.nodes.get(id); }

  stats() {
    const byLayer = {} as Record<string, number>;
    for (const o of this.observations) byLayer[o.layer] = (byLayer[o.layer] ?? 0) + 1;
    return {
      nodes: this.nodes.size,
      observations: this.observations.length,
      contributingLayers: Object.keys(byLayer).length,
      observationsByLayer: byLayer,
      hottest: this.query(5),
    };
  }

  private kindOf(nodeId: string): NodeKind {
    const k = nodeId.split(':')[0];
    return (['service', 'city', 'vertical', 'customer', 'vendor', 'payment', 'threat', 'infrastructure', 'model', 'kpi'] as NodeKind[]).includes(k as NodeKind)
      ? (k as NodeKind) : 'kpi';
  }
}
