-- ============================================================================
-- MIGRATION 007 — SHIELD: Autonomous Cybersecurity, Threat Intelligence &
-- Platform Defense Swarm (docs/29).
--
-- Backing store for the agent swarm, real-time threat detection, fraud
-- signals, autonomous response (with approval workflows), self-healing,
-- zero-trust decisions and compliance/audit reporting.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS shield;

-- 1) Agent fleet registry (hundreds → thousands, elastically scaled)
CREATE TABLE IF NOT EXISTS shield.security_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT UNIQUE NOT NULL,               -- agt_n123 (engine handle)
  kind TEXT NOT NULL CHECK (kind IN ('network','application','infrastructure','identity','data','threat_intel','fraud','data_intelligence')),
  monitors TEXT[] NOT NULL DEFAULT '{}',
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  region TEXT NOT NULL DEFAULT 'af-south-1',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ,
  checks BIGINT NOT NULL DEFAULT 0,
  findings BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','retired'))
);
CREATE INDEX IF NOT EXISTS idx_shield_agents_kind ON shield.security_agents(kind, status);

-- 2) Real-time security events (streamed; partitioned by day in production)
CREATE TABLE IF NOT EXISTS shield.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT NOT NULL CHECK (category IN ('auth','api','wallet','escrow','db','infra','network','vendor','customer','whatsapp','devsecops')),
  source TEXT NOT NULL,
  principal TEXT,
  ip INET,
  device_id TEXT,
  action TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('success','failure','denied')),
  bytes_out BIGINT,
  risk_hints TEXT[] NOT NULL DEFAULT '{}',
  meta JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_shield_events_principal ON shield.security_events(principal, ts DESC);
CREATE INDEX IF NOT EXISTS idx_shield_events_category ON shield.security_events(category, ts DESC);

-- 3) Detected threats (deduplicated, scored, correlated)
CREATE TABLE IF NOT EXISTS shield.threats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key TEXT UNIQUE NOT NULL,              -- thr_123 (engine handle)
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,                           -- credential_abuse, ddos_attack, malware_ransomware…
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  principal TEXT, ip INET, category TEXT,
  sources TEXT[] NOT NULL DEFAULT '{}',
  signals TEXT[] NOT NULL DEFAULT '{}',
  campaign_key TEXT,                            -- correlation group
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','containing','contained','resolved','false_positive'))
);
CREATE INDEX IF NOT EXISTS idx_shield_threats_status ON shield.threats(status, severity DESC);
CREATE INDEX IF NOT EXISTS idx_shield_threats_campaign ON shield.threats(campaign_key);

-- 4) Incidents (correlated threat campaigns with timelines)
CREATE TABLE IF NOT EXISTS shield.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key TEXT,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating','contained','eradicated','recovered','closed')),
  timeline JSONB NOT NULL DEFAULT '[]',         -- [{ts, event, actor}]
  detected_by TEXT NOT NULL DEFAULT 'shield-autonomous',
  owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- 5) Autonomous response action ledger
CREATE TABLE IF NOT EXISTS shield.response_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key TEXT UNIQUE NOT NULL,              -- rsp_12
  threat_id UUID REFERENCES shield.threats(id),
  action TEXT NOT NULL CHECK (action IN ('block_request','rate_limit','suspend_account','disable_credential','quarantine_workload','revoke_tokens','isolate_service','emergency_workflow','alert_admins','escalate_incident')),
  mode TEXT NOT NULL CHECK (mode IN ('auto','approval','notify')),
  status TEXT NOT NULL CHECK (status IN ('executed','pending_approval','rejected','expired')),
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  executed_by TEXT NOT NULL DEFAULT 'shield-autonomous',
  approved_by TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shield_actions_status ON shield.response_actions(status, ts DESC);

-- 6) Approval workflow queue (high-impact actions need human decision)
CREATE TABLE IF NOT EXISTS shield.action_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_action_id UUID NOT NULL REFERENCES shield.response_actions(id),
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  risk_score INT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  decision TEXT CHECK (decision IN ('approved','rejected'))
);

-- 7) Response policies (configurable thresholds & modes — the guardrails)
CREATE TABLE IF NOT EXISTS shield.response_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  min_severity TEXT NOT NULL CHECK (min_severity IN ('critical','high','medium','low')),
  min_score INT NOT NULL CHECK (min_score BETWEEN 0 AND 100),
  mode TEXT NOT NULL CHECK (mode IN ('auto','approval','notify')),
  cooldown_sec INT NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action)
);

-- 8) Fraud alerts (fraud & trust swarm)
CREATE TABLE IF NOT EXISTS shield.fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key TEXT UNIQUE NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  rule TEXT NOT NULL,                           -- booking_velocity, promo_abuse, account_takeover_drain…
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  principal TEXT NOT NULL,
  evidence TEXT[] NOT NULL DEFAULT '{}',
  recommended_actions TEXT[] NOT NULL DEFAULT '{}',
  trust_score_after INT
);
CREATE INDEX IF NOT EXISTS idx_shield_fraud_principal ON shield.fraud_alerts(principal, ts DESC);

-- 9) Threat intelligence — attack pattern library (MITRE ATT&CK mapped)
CREATE TABLE IF NOT EXISTS shield.attack_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_key TEXT UNIQUE NOT NULL,             -- apt.credential-stuffing
  name TEXT NOT NULL,
  mitre TEXT,                                   -- T1110
  tactics TEXT[] NOT NULL DEFAULT '{}',
  matches_threat_types TEXT[] NOT NULL DEFAULT '{}',
  playbook_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10) Vulnerability library (dependency/infra/code scanning results)
CREATE TABLE IF NOT EXISTS shield.vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vuln_key TEXT UNIQUE NOT NULL,
  cve TEXT,
  component TEXT NOT NULL,
  title TEXT NOT NULL,
  cvss NUMERIC(3,1) NOT NULL CHECK (cvss BETWEEN 0 AND 10),
  exploit_likelihood NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK (exploit_likelihood BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','patching','mitigated','accepted')),
  sla_hours INT NOT NULL DEFAULT 168,
  source TEXT NOT NULL DEFAULT 'ci-scan',       -- sast, dependency, container, iac, registry
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shield_vulns_status ON shield.vulnerabilities(status, cvss DESC);

-- 11) Security playbooks
CREATE TABLE IF NOT EXISTS shield.playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_key TEXT UNIQUE NOT NULL,            -- pb.ato
  name TEXT NOT NULL,
  triggers TEXT[] NOT NULL DEFAULT '{}',
  steps TEXT[] NOT NULL DEFAULT '{}',
  auto_actions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12) Behavioral baselines & models (deviation scoring input)
CREATE TABLE IF NOT EXISTS shield.behavioral_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  principal TEXT UNIQUE NOT NULL,
  active_hours INT[] NOT NULL DEFAULT '{6,23}',
  cities TEXT[] NOT NULL DEFAULT '{}',
  devices TEXT[] NOT NULL DEFAULT '{}',
  avg_tx_minor BIGINT NOT NULL DEFAULT 0,
  samples INT NOT NULL DEFAULT 0,
  model_version TEXT NOT NULL DEFAULT 'v1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13) Self-healing recovery runs
CREATE TABLE IF NOT EXISTS shield.recovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_key TEXT UNIQUE NOT NULL,
  service TEXT NOT NULL,
  trigger TEXT NOT NULL,
  steps TEXT[] NOT NULL DEFAULT '{}',
  steps_done TEXT[] NOT NULL DEFAULT '{}',
  mode TEXT NOT NULL CHECK (mode IN ('auto','approval')),
  outcome TEXT NOT NULL CHECK (outcome IN ('recovered','degraded_recovered','failed','awaiting_approval')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  approved_by TEXT
);

-- 14) Device trust scores (zero-trust device identity)
CREATE TABLE IF NOT EXISTS shield.device_trust (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  trust_score INT NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  incidents INT NOT NULL DEFAULT 0,
  distinct_principals INT NOT NULL DEFAULT 1,
  mfa_seen BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15) Zero-trust access decisions (continuous verification trail)
CREATE TABLE IF NOT EXISTS shield.access_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  principal TEXT NOT NULL,
  role TEXT NOT NULL,
  capability TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow','step_up_mfa','allow_read_only','deny')),
  reasons TEXT[] NOT NULL DEFAULT '{}',
  trust_score INT NOT NULL DEFAULT 0,
  ip INET, device_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_shield_access_principal ON shield.access_decisions(principal, ts DESC);

-- 16) Compliance & audit reports (SOC 2 / ISO 27001 / GDPR / NDPR / PCI DSS)
CREATE TABLE IF NOT EXISTS shield.compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('security-audit-log','incident-report','compliance-report','forensic-record','access-review','security-assessment')),
  framework TEXT,                               -- SOC2, ISO27001, GDPR, NDPR, PCI_DSS
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','final')),
  summary TEXT,
  evidence JSONB NOT NULL DEFAULT '{}',
  generated_by TEXT NOT NULL DEFAULT 'shield-autonomous',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: default response policies (engine DEFAULT_POLICIES parity)
INSERT INTO shield.response_policies (action, min_severity, min_score, mode, cooldown_sec, updated_by) VALUES
  ('block_request','medium',45,'auto',60,'seed'),
  ('rate_limit','medium',45,'auto',300,'seed'),
  ('alert_admins','medium',40,'auto',0,'seed'),
  ('escalate_incident','high',70,'auto',0,'seed'),
  ('revoke_tokens','high',65,'auto',0,'seed'),
  ('suspend_account','high',70,'approval',0,'seed'),
  ('disable_credential','high',75,'approval',0,'seed'),
  ('quarantine_workload','critical',85,'approval',0,'seed'),
  ('isolate_service','critical',90,'approval',0,'seed'),
  ('emergency_workflow','critical',90,'approval',0,'seed')
ON CONFLICT (action) DO NOTHING;

-- Seed: attack pattern library (MITRE ATT&CK)
INSERT INTO shield.attack_patterns (pattern_key, name, mitre, tactics, matches_threat_types) VALUES
  ('apt.credential-stuffing','Credential stuffing & brute force','T1110','{initial-access}','{credential_abuse,unauthorized_access}'),
  ('apt.ato','Account takeover chain','T1078','{initial-access,persistence}','{account_takeover,session_hijack}'),
  ('apt.ddos','Volumetric DDoS / bot flood','T1498','{impact}','{ddos_attack,bot_attack}'),
  ('apt.exfil','Data exfiltration over API','T1567','{exfiltration}','{data_exfiltration,insider_threat}'),
  ('apt.ransomware','Ransomware / mass encryption','T1486','{impact}','{malware_ransomware}'),
  ('apt.privesc','Privilege escalation abuse','T1068','{privilege-escalation}','{privilege_escalation}')
ON CONFLICT (pattern_key) DO NOTHING;

-- Seed: security playbooks
INSERT INTO shield.playbooks (playbook_key, name, triggers, steps, auto_actions) VALUES
  ('pb.cred-abuse','Credential abuse containment','{credential_abuse}','{rate-limit source,force MFA,review auth log,reset credentials}','{rate_limit,block_request,alert_admins}'),
  ('pb.ato','Account takeover response','{account_takeover,session_hijack}','{revoke sessions,freeze wallet,notify customer,restore access}','{revoke_tokens,block_request,escalate_incident}'),
  ('pb.ddos','DDoS absorption','{ddos_attack,bot_attack}','{edge rate limiting,bot challenge,scale edge,notify AWS Shield}','{rate_limit,block_request,alert_admins}'),
  ('pb.exfil','Exfiltration stop','{data_exfiltration,insider_threat}','{cut egress,quarantine workload,forensic snapshot,legal escalation}','{revoke_tokens,quarantine_workload,escalate_incident}'),
  ('pb.ransomware','Ransomware response','{malware_ransomware}','{isolate services,snapshot,restore clean backups,crisis comms}','{isolate_service,quarantine_workload,escalate_incident,emergency_workflow}'),
  ('pb.privesc','Privilege escalation response','{privilege_escalation}','{revert grants,disable credentials,audit admin actions}','{disable_credential,revoke_tokens,escalate_incident}'),
  ('pb.default','Generic containment','{*}','{triage,contain,eradicate,recover,lesson learned}','{alert_admins}')
ON CONFLICT (playbook_key) DO NOTHING;
