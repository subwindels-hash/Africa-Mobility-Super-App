/**
 * AI-powered Threat Intelligence — knowledge base (attack patterns, vulnerability
 * library, playbooks, incident history) + behavioral models used for prediction
 * and recommendations.
 */

import type { Severity, Threat, ThreatType } from './detection';

export interface AttackPattern {
  id: string;
  name: string;
  mitre?: string;                       // ATT&CK technique id
  tactics: string[];
  matches: ThreatType[];                // threat types this pattern explains
  playbook: string;                     // playbook id
}

export interface Vulnerability {
  id: string;
  cve?: string;
  component: string;
  title: string;
  cvss: number;                         // 0-10
  exploitLikelihood: number;            // 0-1 (KEV/EPU style)
  status: 'open' | 'patching' | 'mitigated' | 'accepted';
  slaHours: number;
}

export interface Playbook {
  id: string;
  name: string;
  triggers: string[];                   // threat types / pattern ids
  steps: string[];
  autoActions: string[];                // autonomous-response actions allowed
}

export interface BehavioralBaseline {
  principal: string;
  activeHours: [number, number];        // local hours
  cities: string[];
  devices: string[];
  avgTxMinor: number;
  samples: number;
}

export class IntelBase {
  private patterns = new Map<string, AttackPattern>();
  private vulns = new Map<string, Vulnerability>();
  private playbooks = new Map<string, Playbook>();
  private history: Threat[] = [];       // incident history (resolved threats)
  private baselines = new Map<string, BehavioralBaseline>();

  addPattern(p: AttackPattern): void { this.patterns.set(p.id, p); }
  addVulnerability(v: Vulnerability): void { this.vulns.set(v.id, v); }
  addPlaybook(pb: Playbook): void { this.playbooks.set(pb.id, pb); }
  addBaseline(b: BehavioralBaseline): void { this.baselines.set(b.principal, b); }
  archiveIncident(t: Threat): void { this.history.push(t); }

  /** Threat correlation: which known attack patterns explain this threat? */
  correlate(threat: Threat): AttackPattern[] {
    return [...this.patterns.values()].filter((p) => p.matches.includes(threat.type));
  }

  /** Vulnerability prioritization: risk = impact × exploitability, SLA-aware. */
  prioritize(): (Vulnerability & { risk: number; slaBreached: boolean })[] {
    const now = Date.now();
    return [...this.vulns.values()]
      .filter((v) => v.status === 'open' || v.status === 'patching')
      .map((v) => ({
        ...v,
        risk: Math.round(v.cvss * 10 * (0.4 + 0.6 * v.exploitLikelihood)),
        slaBreached: v.status === 'open' && now - 0 > 0 && v.slaHours < 24 && v.cvss >= 9,
      }))
      .sort((a, b) => b.risk - a.risk);
  }

  /** Recommendation for a live threat: playbook + first actions. */
  recommend(threat: Threat): { pattern?: AttackPattern; playbook: Playbook; rationale: string } {
    const pattern = this.correlate(threat)[0];
    const playbook = [...this.playbooks.values()].find((pb) => pb.triggers.includes(threat.type) || (pattern && pb.id === pattern.playbook))
      ?? [...this.playbooks.values()].find((pb) => pb.triggers.includes('*'))!;
    return {
      pattern,
      playbook,
      rationale: pattern
        ? `${pattern.name}${pattern.mitre ? ` (MITRE ${pattern.mitre})` : ''} → ${playbook.name}`
        : `no matching pattern — default ${playbook.name}`,
    };
  }

  /** Attack prediction: highest-risk open vulns + most frequent historical threat types. */
  predict(): { topVulnerabilities: string[]; likelyNextThreats: { type: ThreatType; count: number }[] } {
    const counts = new Map<ThreatType, number>();
    for (const t of this.history) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
    const likelyNextThreats = [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    return { topVulnerabilities: this.prioritize().slice(0, 5).map((v) => v.id), likelyNextThreats };
  }

  /** Behavioral deviation: how far an activity sits from the principal's baseline. */
  deviation(principal: string, activity: { hour: number; city?: string; deviceId?: string; amountMinor?: number }): number {
    const b = this.baselines.get(principal);
    if (!b || b.samples < 5) return 0;
    let score = 0;
    if (activity.hour < b.activeHours[0] || activity.hour > b.activeHours[1]) score += 30;
    if (activity.city && !b.cities.includes(activity.city)) score += 25;
    if (activity.deviceId && !b.devices.includes(activity.deviceId)) score += 25;
    if (activity.amountMinor && b.avgTxMinor > 0 && activity.amountMinor > 4 * b.avgTxMinor) score += 20;
    return Math.min(100, score);
  }

  severityBuckets(): Record<Severity, number> {
    const out = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const v of this.vulns.values()) if (v.status === 'open') out[v.cvss >= 9 ? 'critical' : v.cvss >= 7 ? 'high' : v.cvss >= 4 ? 'medium' : 'low']++;
    return out;
  }

  export() {
    return {
      attackPatterns: [...this.patterns.values()],
      vulnerabilities: [...this.vulns.values()],
      playbooks: [...this.playbooks.values()],
      incidentHistory: this.history.length,
      baselines: [...this.baselines.values()],
    };
  }
}
