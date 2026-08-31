/**
 * ORGANISM — Global AI Organism Architecture (docs/30).
 *
 * The AMSA platform as a single distributed cognitive enterprise organism:
 * eight agent layers, 120,000+ specialized intelligence nodes, a shared
 * real-time intelligence graph, an AI executive board, autonomous execution,
 * and continuous evolution through feedback loops.
 *
 * Layer 3 (cybersecurity) is operationalized by the SHIELD swarm (docs/29);
 * this module defines the canonical fleet topology and drives the full
 * intelligence flow across all layers.
 */

export type LayerId =
  | 'data_analysis' | 'executive' | 'security' | 'operations'
  | 'automation' | 'product' | 'orchestration' | 'evolution';

export interface SubSwarm {
  id: string;
  name: string;
  agents: number;
  functions: string[];
}

export interface LayerSpec {
  id: LayerId;
  name: string;
  purpose: string;
  agents: number;                 // canonical fleet size
  subSwarms: SubSwarm[];
}

export const LAYERS: Record<LayerId, LayerSpec> = {
  data_analysis: {
    id: 'data_analysis', name: 'Data Analysis Agent Layer', agents: 60_000,
    purpose: 'Transform raw platform data into structured, actionable intelligence in real time',
    subSwarms: [
      { id: 'core_data', name: '📡 Core Data Intelligence Swarm', agents: 10_000, functions: ['system telemetry processing', 'API + log ingestion', 'database stream analysis', 'infrastructure health mapping'] },
      { id: 'business_intel', name: '📈 Business Intelligence Swarm', agents: 10_000, functions: ['revenue analytics', 'user growth modeling', 'market performance tracking', 'profitability optimization'] },
      { id: 'predictive', name: '🔮 Predictive Intelligence Swarm', agents: 10_000, functions: ['demand forecasting', 'system failure prediction', 'user behavior modeling', 'market trend simulation'] },
      { id: 'security_data', name: '🛡️ Security Data Intelligence Swarm', agents: 10_000, functions: ['threat pattern detection', 'log correlation', 'anomaly detection', 'security signal generation'] },
      { id: 'product_intel', name: '👤 Product Intelligence Swarm', agents: 10_000, functions: ['UX tracking', 'feature adoption analysis', 'engagement modeling', 'retention optimization'] },
      { id: 'ai_optimization', name: '🤖 AI Optimization Swarm', agents: 10_000, functions: ['AI performance monitoring', 'cost optimization', 'routing efficiency', 'model feedback loops'] },
    ],
  },
  executive: {
    id: 'executive', name: 'Executive Support Layer', agents: 10_000,
    purpose: 'Simulates a full AI executive leadership structure for autonomous decision-making',
    subSwarms: [
      { id: 'ceo', name: '👑 CEO Cluster', agents: 2_000, functions: ['strategic synthesis', 'global prioritization', 'long-term planning'] },
      { id: 'cfo', name: '💰 CFO Cluster', agents: 1_500, functions: ['financial forecasting', 'budget optimization', 'profit modeling'] },
      { id: 'coo', name: '⚙️ COO Cluster', agents: 1_500, functions: ['operations optimization', 'resource allocation', 'performance governance'] },
      { id: 'cto', name: '💻 CTO Cluster', agents: 1_500, functions: ['architecture design', 'scalability planning', 'engineering intelligence'] },
      { id: 'ciso', name: '🛡️ CISO Cluster', agents: 1_000, functions: ['security governance', 'risk mitigation', 'threat prioritization'] },
      { id: 'cmo', name: '📈 CMO Cluster', agents: 1_000, functions: ['growth intelligence', 'marketing optimization', 'conversion strategy'] },
      { id: 'chro', name: '👥 CHRO Cluster', agents: 1_000, functions: ['workforce optimization', 'organizational design', 'talent allocation'] },
      { id: 'data_gov', name: '📊 Data Governance Cluster', agents: 1_500, functions: ['cross-layer validation', 'intelligence consistency', 'executive reporting'] },
    ],
  },
  security: {
    id: 'security', name: 'Cybersecurity & Threat Intelligence Swarm', agents: 10_000,
    purpose: 'Autonomous defense, detection, response and recovery (operationalized as SHIELD, docs/29)',
    subSwarms: [
      { id: 'network_sec', name: '🌐 Network Security Agents', agents: 2_000, functions: ['traffic monitoring', 'DDoS detection', 'network anomaly detection'] },
      { id: 'app_sec', name: '🧩 Application Security Agents', agents: 2_000, functions: ['API security', 'app vulnerability detection', 'exploit prevention'] },
      { id: 'infra_sec', name: '🖥️ Infrastructure Security Agents', agents: 2_000, functions: ['cloud security monitoring', 'container protection', 'server hardening'] },
      { id: 'identity_sec', name: '🔐 Identity Security Agents', agents: 2_000, functions: ['authentication monitoring', 'MFA enforcement', 'access control protection'] },
      { id: 'data_sec', name: '📊 Data Security Agents', agents: 1_000, functions: ['data leak prevention', 'encryption enforcement', 'sensitive data tracking'] },
      { id: 'threat_intel', name: '🧠 Threat Intelligence Agents', agents: 1_000, functions: ['global threat feeds', 'attack prediction', 'vulnerability analysis'] },
    ],
  },
  operations: {
    id: 'operations', name: 'Operations & Infrastructure Layer', agents: 15_000,
    purpose: 'Ensure system stability, scalability and uptime',
    subSwarms: [
      { id: 'cloud_infra', name: '☁️ Cloud Infrastructure Agents', agents: 4_000, functions: ['cloud estate management', 'capacity provisioning', 'cost-aware scaling'] },
      { id: 'load_balancing', name: '⚖️ Load Balancing Agents', agents: 3_000, functions: ['traffic distribution', 'health-aware routing', 'surge absorption'] },
      { id: 'devops', name: '🔧 DevOps Automation Agents', agents: 3_000, functions: ['deployments', 'rollbacks', 'pipeline automation'] },
      { id: 'api_mgmt', name: '🔌 API Management Agents', agents: 3_000, functions: ['gateway policy', 'rate governance', 'versioning'] },
      { id: 'db_optimization', name: '🗄️ Database Optimization Agents', agents: 2_000, functions: ['query optimization', 'indexing', 'vacuum/tuning'] },
    ],
  },
  automation: {
    id: 'automation', name: 'Automation & Execution Layer', agents: 10_000,
    purpose: 'Convert decisions into real-world execution',
    subSwarms: [
      { id: 'workflow', name: '🔁 Workflow Automation Agents', agents: 3_000, functions: ['multi-step workflow execution', 'saga orchestration'] },
      { id: 'comms', name: '📡 Communication System Agents', agents: 2_000, functions: ['notifications', 'WhatsApp/SMS/email dispatch', 'in-app messaging'] },
      { id: 'task_exec', name: '✅ Task Execution Agents', agents: 2_000, functions: ['atomic task execution', 'idempotent retries'] },
      { id: 'microservice', name: '🧱 Microservice Automation Agents', agents: 2_000, functions: ['service-level actions', 'config rollout'] },
      { id: 'bpa', name: '💼 Business Process Automation Agents', agents: 1_000, functions: ['end-to-end business processes', 'partner onboarding'] },
    ],
  },
  product: {
    id: 'product', name: 'Product & User Intelligence Layer', agents: 5_000,
    purpose: 'UX + behavior optimization',
    subSwarms: [
      { id: 'journey', name: '🧭 User Journey Analytics Agents', agents: 1_500, functions: ['funnel analysis', 'journey mapping'] },
      { id: 'adoption', name: '🎯 Feature Adoption Tracking Agents', agents: 1_000, functions: ['adoption funnels', 'cohort tracking'] },
      { id: 'ux_sim', name: '🕹️ UX Simulation Engines', agents: 1_000, functions: ['interface simulation', 'A/B modeling'] },
      { id: 'retention', name: '💗 Retention Optimization Agents', agents: 1_000, functions: ['churn prediction', 'win-back'] },
      { id: 'interface', name: '🖼️ Interface Optimization Agents', agents: 500, functions: ['layout optimization', 'accessibility'] },
    ],
  },
  orchestration: {
    id: 'orchestration', name: 'Orchestration & Coordination Layer', agents: 5_000,
    purpose: 'The central nervous system',
    subSwarms: [
      { id: 'coordination', name: '🎼 Coordination Intelligence Agents', agents: 2_000, functions: ['cross-layer task distribution', 'dependency management'] },
      { id: 'routing', name: '🛣️ Routing Optimization Agents', agents: 1_000, functions: ['task routing', 'agent selection'] },
      { id: 'load_balance', name: '⚖️ Agent Load Balancing Agents', agents: 1_000, functions: ['agent utilization balancing'] },
      { id: 'conflict', name: '🕊️ Conflict Resolution Agents', agents: 1_000, functions: ['priority arbitration', 'resource contention'] },
    ],
  },
  evolution: {
    id: 'evolution', name: 'Advanced Intelligence Evolution Layer', agents: 5_000,
    purpose: 'Enable continuous system evolution',
    subSwarms: [
      { id: 'meta_learning', name: '🧬 Meta-Learning Agents', agents: 2_000, functions: ['learning-to-learn across models', 'transfer of insights'] },
      { id: 'self_improvement', name: '🔧 Self-Improvement Agents', agents: 1_000, functions: ['system tuning proposals', 'autonomous optimization'] },
      { id: 'simulation', name: '🔬 Simulation Agents', agents: 1_000, functions: ['counterfactual simulation', 'what-if analysis'] },
      { id: 'evolution_modeling', name: '🌱 Evolution Modeling Agents', agents: 1_000, functions: ['long-horizon evolution modeling'] },
    ],
  },
};

export const TOTAL_AGENTS: number = (Object.values(LAYERS) as LayerSpec[]).reduce((s, l) => s + l.agents, 0);

export function fleetSummary(): { layer: LayerId; name: string; agents: number; subSwarms: number }[] {
  return (Object.values(LAYERS) as LayerSpec[]).map((l) => ({ layer: l.id, name: l.name, agents: l.agents, subSwarms: l.subSwarms.length }));
}
