-- ============================================================================
-- MIGRATION 008 — ORGANISM: Global AI Organism Architecture (docs/30).
--
-- Persistence for the distributed autonomous enterprise intelligence organism:
-- fleet topology, cognition pulses, shared intelligence graph, executive
-- decisions, orchestrated tasks, evolution experiments and feedback tuning.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS organism;

-- 1) Fleet topology — the canonical 8-layer / 120,000+ agent manifest
CREATE TABLE organism.agent_fleets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer TEXT NOT NULL CHECK (layer IN ('data_analysis','executive','security','operations','automation','product','orchestration','evolution')),
  layer_name TEXT NOT NULL,
  sub_swarm TEXT NOT NULL,
  sub_swarm_name TEXT NOT NULL,
  agents INT NOT NULL CHECK (agents > 0),
  functions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layer, sub_swarm)
);
CREATE INDEX idx_organism_fleets_layer ON organism.agent_fleets(layer);

-- 2) Cognition pulses — one row per full intelligence cycle
CREATE TABLE organism.pulses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_key TEXT UNIQUE NOT NULL,               -- pulse_42 (engine handle)
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INT NOT NULL,
  agents_total INT NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}',          -- demandIndex, latencyMs, threatLevel…
  decisions INT NOT NULL DEFAULT 0,
  tasks INT NOT NULL DEFAULT 0,
  experiments INT NOT NULL DEFAULT 0,
  tunables_after JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_organism_pulses_ts ON organism.pulses(ts DESC);

-- 3) Shared intelligence graph — nodes (the cognitive substrate)
CREATE TABLE organism.graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_key TEXT UNIQUE NOT NULL,                -- kpi:demand, city:NG-LAG, threat:platform
  kind TEXT NOT NULL CHECK (kind IN ('service','city','vertical','customer','vendor','payment','threat','infrastructure','model','kpi')),
  label TEXT NOT NULL,
  weight NUMERIC(12,3) NOT NULL DEFAULT 0,      -- recency-weighted importance
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,   -- cross-agent agreement
  observations INT NOT NULL DEFAULT 0,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_organism_nodes_weight ON organism.graph_nodes(weight DESC);

-- 4) Graph observations — every agent contribution
CREATE TABLE organism.graph_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  layer TEXT NOT NULL,
  sub_swarm TEXT NOT NULL,
  node_key TEXT NOT NULL REFERENCES organism.graph_nodes(node_key),
  signal TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  direction TEXT NOT NULL CHECK (direction IN ('up','down','flat')),
  payload JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_organism_obs_node ON organism.graph_observations(node_key, ts DESC);

-- 5) Executive decisions (AI board output, governance-validated)
CREATE TABLE organism.executive_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_key TEXT UNIQUE NOT NULL,
  pulse_id UUID REFERENCES organism.pulses(id),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  cluster TEXT NOT NULL CHECK (cluster IN ('CEO','CFO','COO','CTO','CISO','CMO','CHRO','DATA_GOV')),
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  priority INT NOT NULL CHECK (priority BETWEEN 1 AND 5),
  expected_impact TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL,
  validated BOOLEAN NOT NULL DEFAULT TRUE,      -- Data Governance sign-off
  flags TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_organism_decisions_priority ON organism.executive_decisions(priority, ts DESC);

-- 6) Orchestrated tasks + execution results
CREATE TABLE organism.execution_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key TEXT UNIQUE NOT NULL,
  decision_id UUID REFERENCES organism.executive_decisions(id),
  kind TEXT NOT NULL CHECK (kind IN ('workflow','communication','task','microservice','business_process')),
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  priority INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','conflict_resolved','succeeded','failed')),
  assigned_sub_swarm TEXT NOT NULL,
  ok BOOLEAN,
  duration_ms INT,
  executed_at TIMESTAMPTZ
);
CREATE INDEX idx_organism_tasks_status ON organism.execution_tasks(status, executed_at DESC);

-- 7) Evolution experiments (meta-learning / self-improvement / simulation / modeling)
CREATE TABLE organism.evolution_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key TEXT UNIQUE NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL CHECK (kind IN ('meta_learning','self_improvement','simulation','evolution_modeling')),
  hypothesis TEXT NOT NULL,
  tunable TEXT NOT NULL,                        -- which organism parameter moves
  from_value TEXT NOT NULL,
  to_value TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','adopted','rejected')),
  measured_delta TEXT,
  pulse_id UUID REFERENCES organism.pulses(id)
);

-- 8) Organism tunables — the live, evolution-managed configuration
CREATE TABLE organism.tunables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  latency_threshold_ms INT NOT NULL DEFAULT 800,
  cost_budget_pct NUMERIC(4,2) NOT NULL DEFAULT 0.62,
  threat_escalation TEXT NOT NULL DEFAULT 'elevated' CHECK (threat_escalation IN ('low','elevated','high','critical')),
  churn_alarm_pct NUMERIC(5,2) NOT NULL DEFAULT 6,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL DEFAULT 'evolution-engine'
);

-- Seed: canonical fleet manifest (layer headers per the architecture table;
-- executive clusters sum to 11,000 against their 10,000 layer header — kept
-- exactly as specified; canonical total = 120,000 via layer budgets).
INSERT INTO organism.agent_fleets (layer, layer_name, sub_swarm, sub_swarm_name, agents, functions) VALUES
 ('data_analysis','Data Analysis Agent Layer','core_data','📡 Core Data Intelligence Swarm',10000,'{system telemetry processing,API + log ingestion,database stream analysis,infrastructure health mapping}'),
 ('data_analysis','Data Analysis Agent Layer','business_intel','📈 Business Intelligence Swarm',10000,'{revenue analytics,user growth modeling,market performance tracking,profitability optimization}'),
 ('data_analysis','Data Analysis Agent Layer','predictive','🔮 Predictive Intelligence Swarm',10000,'{demand forecasting,system failure prediction,user behavior modeling,market trend simulation}'),
 ('data_analysis','Data Analysis Agent Layer','security_data','🛡️ Security Data Intelligence Swarm',10000,'{threat pattern detection,log correlation,anomaly detection,security signal generation}'),
 ('data_analysis','Data Analysis Agent Layer','product_intel','👤 Product Intelligence Swarm',10000,'{UX tracking,feature adoption analysis,engagement modeling,retention optimization}'),
 ('data_analysis','Data Analysis Agent Layer','ai_optimization','🤖 AI Optimization Swarm',10000,'{AI performance monitoring,cost optimization,routing efficiency,model feedback loops}'),
 ('executive','Executive Support Layer','ceo','👑 CEO Cluster',2000,'{strategic synthesis,global prioritization,long-term planning}'),
 ('executive','Executive Support Layer','cfo','💰 CFO Cluster',1500,'{financial forecasting,budget optimization,profit modeling}'),
 ('executive','Executive Support Layer','coo','⚙️ COO Cluster',1500,'{operations optimization,resource allocation,performance governance}'),
 ('executive','Executive Support Layer','cto','💻 CTO Cluster',1500,'{architecture design,scalability planning,engineering intelligence}'),
 ('executive','Executive Support Layer','ciso','🛡️ CISO Cluster',1000,'{security governance,risk mitigation,threat prioritization}'),
 ('executive','Executive Support Layer','cmo','📈 CMO Cluster',1000,'{growth intelligence,marketing optimization,conversion strategy}'),
 ('executive','Executive Support Layer','chro','👥 CHRO Cluster',1000,'{workforce optimization,organizational design,talent allocation}'),
 ('executive','Executive Support Layer','data_gov','📊 Data Governance Cluster',1500,'{cross-layer validation,intelligence consistency,executive reporting}'),
 ('security','Cybersecurity & Threat Intelligence Swarm','network_sec','🌐 Network Security Agents',2000,'{traffic monitoring,DDoS detection,network anomaly detection}'),
 ('security','Cybersecurity & Threat Intelligence Swarm','app_sec','🧩 Application Security Agents',2000,'{API security,app vulnerability detection,exploit prevention}'),
 ('security','Cybersecurity & Threat Intelligence Swarm','infra_sec','🖥️ Infrastructure Security Agents',2000,'{cloud security monitoring,container protection,server hardening}'),
 ('security','Cybersecurity & Threat Intelligence Swarm','identity_sec','🔐 Identity Security Agents',2000,'{authentication monitoring,MFA enforcement,access control protection}'),
 ('security','Cybersecurity & Threat Intelligence Swarm','data_sec','📊 Data Security Agents',1000,'{data leak prevention,encryption enforcement,sensitive data tracking}'),
 ('security','Cybersecurity & Threat Intelligence Swarm','threat_intel','🧠 Threat Intelligence Agents',1000,'{global threat feeds,attack prediction,vulnerability analysis}'),
 ('operations','Operations & Infrastructure Layer','cloud_infra','☁️ Cloud Infrastructure Agents',4000,'{cloud estate management,capacity provisioning,cost-aware scaling}'),
 ('operations','Operations & Infrastructure Layer','load_balancing','⚖️ Load Balancing Agents',3000,'{traffic distribution,health-aware routing,surge absorption}'),
 ('operations','Operations & Infrastructure Layer','devops','🔧 DevOps Automation Agents',3000,'{deployments,rollbacks,pipeline automation}'),
 ('operations','Operations & Infrastructure Layer','api_mgmt','🔌 API Management Agents',3000,'{gateway policy,rate governance,versioning}'),
 ('operations','Operations & Infrastructure Layer','db_optimization','🗄️ Database Optimization Agents',2000,'{query optimization,indexing,vacuum/tuning}'),
 ('automation','Automation & Execution Layer','workflow','🔁 Workflow Automation Agents',3000,'{multi-step workflow execution,saga orchestration}'),
 ('automation','Automation & Execution Layer','comms','📡 Communication System Agents',2000,'{notifications,WhatsApp/SMS/email dispatch,in-app messaging}'),
 ('automation','Automation & Execution Layer','task_exec','✅ Task Execution Agents',2000,'{atomic task execution,idempotent retries}'),
 ('automation','Automation & Execution Layer','microservice','🧱 Microservice Automation Agents',2000,'{service-level actions,config rollout}'),
 ('automation','Automation & Execution Layer','bpa','💼 Business Process Automation Agents',1000,'{end-to-end business processes,partner onboarding}'),
 ('product','Product & User Intelligence Layer','journey','🧭 User Journey Analytics Agents',1500,'{funnel analysis,journey mapping}'),
 ('product','Product & User Intelligence Layer','adoption','🎯 Feature Adoption Tracking Agents',1000,'{adoption funnels,cohort tracking}'),
 ('product','Product & User Intelligence Layer','ux_sim','🕹️ UX Simulation Engines',1000,'{interface simulation,A/B modeling}'),
 ('product','Product & User Intelligence Layer','retention','💗 Retention Optimization Agents',1000,'{churn prediction,win-back}'),
 ('product','Product & User Intelligence Layer','interface','🖼️ Interface Optimization Agents',500,'{layout optimization,accessibility}'),
 ('orchestration','Orchestration & Coordination Layer','coordination','🎼 Coordination Intelligence Agents',2000,'{cross-layer task distribution,dependency management}'),
 ('orchestration','Orchestration & Coordination Layer','routing','🛣️ Routing Optimization Agents',1000,'{task routing,agent selection}'),
 ('orchestration','Orchestration & Coordination Layer','load_balance','⚖️ Agent Load Balancing Agents',1000,'{agent utilization balancing}'),
 ('orchestration','Orchestration & Coordination Layer','conflict','🕊️ Conflict Resolution Agents',1000,'{priority arbitration,resource contention}'),
 ('evolution','Advanced Intelligence Evolution Layer','meta_learning','🧬 Meta-Learning Agents',2000,'{learning-to-learn across models,transfer of insights}'),
 ('evolution','Advanced Intelligence Evolution Layer','self_improvement','🔧 Self-Improvement Agents',1000,'{system tuning proposals,autonomous optimization}'),
 ('evolution','Advanced Intelligence Evolution Layer','simulation','🔬 Simulation Agents',1000,'{counterfactual simulation,what-if analysis}'),
 ('evolution','Advanced Intelligence Evolution Layer','evolution_modeling','🌱 Evolution Modeling Agents',1000,'{long-horizon evolution modeling}')
ON CONFLICT (layer, sub_swarm) DO NOTHING;

INSERT INTO organism.tunables (latency_threshold_ms, cost_budget_pct, threat_escalation, churn_alarm_pct, updated_by)
VALUES (800, 0.62, 'elevated', 6, 'seed')
ON CONFLICT DO NOTHING;
