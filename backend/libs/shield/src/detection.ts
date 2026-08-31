/**
 * Real-time threat detection — every security-relevant event in the platform
 * flows through here (auth, API, wallet, escrow, DB, infra, network, vendor,
 * customer, WhatsApp AI, devsecops). Signatures raise Threats; correlation
 * links related threats into campaigns.
 */

export type EventCategory =
  | 'auth' | 'api' | 'wallet' | 'escrow' | 'db' | 'infra' | 'network' | 'vendor'
  | 'customer' | 'whatsapp' | 'devsecops' | 'vehicle';

export type ThreatType =
  | 'unauthorized_access' | 'credential_abuse' | 'account_takeover' | 'bot_attack'
  | 'ddos_attack' | 'data_exfiltration' | 'insider_threat' | 'privilege_escalation'
  | 'malware_ransomware' | 'automated_abuse' | 'session_hijack' | 'network_anomaly';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface SecurityEvent {
  id?: string;
  ts?: Date;
  category: EventCategory;
  source: string;                 // surface: mobile-app, admin-dashboard, psp.paystack, k8s:prod…
  principal?: string;             // userId / vendorId / ip — whoever the event is about
  ip?: string;
  deviceId?: string;
  action: string;                 // auth.login, wallet.withdraw, db.bulk_read…
  outcome?: 'success' | 'failure' | 'denied';
  bytesOut?: number;              // for exfiltration analytics
  riskHints?: string[];           // free-form signal tags
  meta?: Record<string, unknown>;
}

export interface Threat {
  id: string;
  ts: Date;
  type: ThreatType;
  severity: Severity;
  score: number;                  // 0-100
  principal?: string;
  ip?: string;
  category: EventCategory;
  sources: string[];              // event ids / sources
  signals: string[];
  status: 'open' | 'containing' | 'contained' | 'resolved' | 'false_positive';
  correlatedTo?: string;          // campaign/incident id
}

export const SEVERITY_FOR_SCORE = (score: number): Severity =>
  score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low';

// ── per-principal rolling state (Redis streams in production) ───────────────
interface PrincipalState {
  authFailures: { ts: number; ip?: string }[];
  denied: { ts: number; action: string }[];
  bytesOutWindow: { ts: number; bytes: number }[];
  requests: { ts: number }[];
  cities: { ts: number; city: string }[];
  adminActions: { ts: number; action: string }[];
  offHoursReads: number;
}

const WINDOW_MS = 10 * 60 * 1000; // 10-minute detection windows
const within = <T extends { ts: number }>(list: T[], now: number): T[] => list.filter((x) => now - x.ts <= WINDOW_MS);

export interface DetectionPolicy {
  authFailureThreshold: number;      // failures/window → credential abuse
  requestsPerWindow: number;         // one principal → bot
  globalRpsThreshold: number;        // events/min platform-wide → DDoS
  exfilBytesPerWindow: number;       // bytes out → exfiltration
  impossibleTravelKmPerMin: number;  // city hop speed
}

export const DEFAULT_DETECTION_POLICY: DetectionPolicy = {
  authFailureThreshold: 5, requestsPerWindow: 300, globalRpsThreshold: 5000,
  exfilBytesPerWindow: 50 * 1024 * 1024, impossibleTravelKmPerMin: 8,
};

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export class DetectionEngine {
  private state = new Map<string, PrincipalState>();
  private events: SecurityEvent[] = [];
  private threats: Threat[] = [];
  private seq = 0;
  private eseq = 0;

  constructor(private policy: DetectionPolicy = DEFAULT_DETECTION_POLICY) {}

  /** Ingest one event; returns threats raised by it (possibly none). */
  ingest(event: SecurityEvent): Threat[] {
    const e: SecurityEvent = { ...event, id: event.id ?? `evt_${++this.eseq}`, ts: event.ts ?? new Date() };
    this.events.push(e);
    const raised: Threat[] = [];
    const now = e.ts!.getTime();
    const key = e.principal ?? e.ip ?? 'anonymous';
    const st = this.state.get(key) ?? this.emptyState();

    // ── credential abuse / brute force ──
    if (e.category === 'auth' && e.outcome === 'failure') {
      st.authFailures.push({ ts: now, ip: e.ip });
      const wins = within(st.authFailures, now);
      if (wins.length >= this.policy.authFailureThreshold) {
        raised.push(this.raise('credential_abuse', 60 + Math.min(30, wins.length * 2), e, [
          `${wins.length} failed auths in 10min from ${[...new Set(wins.map((w) => w.ip).filter(Boolean))].join(', ')}`,
        ]));
        st.authFailures = [];
      }
    }

    // ── unauthorized access ──
    if (e.outcome === 'denied' || e.riskHints?.includes('rbac_violation')) {
      st.denied.push({ ts: now, action: e.action });
      const d = within(st.denied, now);
      if (d.length >= 3) {
        raised.push(this.raise('unauthorized_access', 55 + d.length * 5, e, d.map((x) => `denied ${x.action}`)));
      }
    }

    // ── privilege escalation ──
    // §13 vehicle cybersecurity — spoofing/theft/malicious-command signals raise immediately
    if (e.category === 'vehicle' && e.riskHints?.some((h) =>
      ['gps_spoofing','vehicle_theft','unauthorized_remote_access','malicious_command','sensor_manipulation','vehicle_identity_fraud','communication_attack','unauthorized_usage'].includes(h))) {
      const spoof = e.riskHints.some((h) => ['gps_spoofing','sensor_manipulation'].includes(h));
      raised.push(this.raise(spoof ? 'network_anomaly' : 'unauthorized_access', spoof ? 78 : 82, e, [
        `vehicle security signal: ${e.riskHints.join(',')}`,
      ]));
    }

    if (e.riskHints?.includes('role_change') || /grant|escalate|admin.*create/i.test(e.action)) {
      if (e.riskHints?.includes('self_service') || e.riskHints?.includes('unapproved_role_change')) {
        raised.push(this.raise('privilege_escalation', 88, e, ['role elevation outside approval workflow']));
      }
    }

    // ── bot / automated abuse ──
    st.requests.push({ ts: now });
    const reqs = within(st.requests, now);
    if (reqs.length === this.policy.requestsPerWindow) {
      raised.push(this.raise('bot_attack', 62, e, [`${reqs.length} requests in 10min (no human jitter)`]));
    }

    // ── DDoS (platform-wide) ──
    const lastMin = this.events.filter((x) => now - x.ts!.getTime() <= 60_000);
    if (lastMin.length === this.policy.globalRpsThreshold) {
      raised.push(this.raise('ddos_attack', 90, e, [`${lastMin.length} events/min platform-wide`]));
    }

    // ── data exfiltration / insider threat ──
    if (e.bytesOut) {
      st.bytesOutWindow.push({ ts: now, bytes: e.bytesOut });
      const total = within(st.bytesOutWindow, now).reduce((s, x) => s + x.bytes, 0);
      if (total >= this.policy.exfilBytesPerWindow) {
        const offHours = e.riskHints?.includes('off_hours');
        raised.push(this.raise(offHours ? 'insider_threat' : 'data_exfiltration', offHours ? 80 : 75, e, [
          `${(total / 1024 / 1024).toFixed(0)} MB egress in 10min${offHours ? ' outside active hours' : ''}`,
        ]));
        st.bytesOutWindow = [];
      }
    }
    if (e.riskHints?.includes('bulk_export') && e.riskHints?.includes('off_hours')) {
      st.offHoursReads++;
      if (st.offHoursReads >= 3) raised.push(this.raise('insider_threat', 78, e, ['repeated off-hours bulk exports']));
    }

    // ── malware / ransomware indicators (from infra agents) ──
    if (e.riskHints?.some((h) => ['mass_encrypt', 'shadow_process', 'known_malware_c2', 'ransom_note'] .includes(h))) {
      raised.push(this.raise('malware_ransomware', 95, e, e.riskHints!));
    }

    // ── session hijack (identity jump mid-session) ──
    if (e.riskHints?.includes('session_ip_jump') || e.riskHints?.includes('session_device_jump')) {
      raised.push(this.raise('session_hijack', 72, e, ['session moved between identities mid-flight']));
    }

    // ── impossible travel / geo anomalies (needs meta.geo) ──
    const geo = e.meta?.geo as { lat: number; lng: number; city: string } | undefined;
    if (geo) {
      st.cities.push({ ts: now, city: geo.city });
      const recent = within(st.cities, now);
      const prev = recent[recent.length - 2];
      if (prev && prev.city !== geo.city && e.meta?.prevGeo) {
        const pg = e.meta.prevGeo as { lat: number; lng: number };
        const dist = km(pg, geo);
        const mins = Math.max(1, (now - prev.ts) / 60_000);
        if (dist / mins > this.policy.impossibleTravelKmPerMin) {
          raised.push(this.raise('account_takeover', 70, e, [`${dist.toFixed(0)} km in ${mins.toFixed(0)}min — impossible travel`]));
        }
      }
    }

    // ── network anomaly (from network agents) ──
    if (e.riskHints?.includes('traffic_spike') || e.riskHints?.includes('port_scan')) {
      raised.push(this.raise('network_anomaly', 58, e, e.riskHints!));
    }

    this.state.set(key, st);
    return raised;
  }

  private raise(type: ThreatType, score: number, e: SecurityEvent, signals: string[]): Threat {
    const t: Threat = {
      id: `thr_${++this.seq}`, ts: e.ts!, type, severity: SEVERITY_FOR_SCORE(score), score,
      principal: e.principal, ip: e.ip, category: e.category, sources: [e.id!], signals,
      status: 'open',
    };
    this.threats.push(t);
    return t;
  }

  /** Correlate open threats sharing principal/ip → one campaign, bump severity. */
  correlate(): { campaigns: { key: string; threats: string[]; severity: Severity }[]; updated: number } {
    const open = this.threats.filter((t) => t.status === 'open' || t.status === 'containing');
    const groups = new Map<string, Threat[]>();
    for (const t of open) {
      const k = t.principal ?? t.ip ?? t.id;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
    }
    const campaigns: { key: string; threats: string[]; severity: Severity }[] = [];
    let updated = 0;
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      const campaignId = `cmp_${key}`;
      const maxScore = Math.max(...list.map((t) => t.score)) + 10 * (list.length - 1);
      for (const t of list) { t.correlatedTo = campaignId; t.score = Math.min(100, Math.max(t.score, maxScore)); t.severity = SEVERITY_FOR_SCORE(t.score); updated++; }
      campaigns.push({ key, threats: list.map((t) => t.id), severity: SEVERITY_FOR_SCORE(Math.min(100, maxScore)) });
    }
    return { campaigns, updated };
  }

  list(filter?: { status?: Threat['status']; type?: ThreatType }): Threat[] {
    return this.threats.filter((t) => (!filter?.status || t.status === filter.status) && (!filter?.type || t.type === filter.type));
  }

  setStatus(id: string, status: Threat['status']): Threat | undefined {
    const t = this.threats.find((x) => x.id === id);
    if (t) t.status = status;
    return t;
  }

  private emptyState(): PrincipalState {
    return { authFailures: [], denied: [], bytesOutWindow: [], requests: [], cities: [], adminActions: [], offHoursReads: 0 };
  }
}
