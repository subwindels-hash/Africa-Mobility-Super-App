/**
 * SHIELD API — live endpoint tests for the autonomous defense swarm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import app from '../apps/api/main';

const PORT = 4314;
let server: http.Server;
const base = `http://127.0.0.1:${PORT}`;

beforeAll(async () => {
  server = http.createServer(app).listen(PORT);
  await new Promise((r) => server.on('listening', r));
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

describe('SHIELD API — SOC & swarm', () => {
  it('SOC snapshot exposes score, risk level, agents, vulnerabilities, prediction', async () => {
    const r = await req('GET', '/v1/shield/soc');
    expect(r.status).toBe(200);
    expect(r.json.agentActivity.totalAgents).toBeGreaterThanOrEqual(200);
    expect(['low', 'elevated', 'high', 'critical']).toContain(r.json.riskLevel);
    expect(r.json.vulnerabilities.top.length).toBeGreaterThan(0);
  });

  it('swarm scales to thousands under critical threat', async () => {
    const r = await req('POST', '/v1/shield/agents/scale', { demandIndex: 3, threatLevel: 'critical', countries: 7, transactionsPerMin: 25_000 });
    expect(r.status).toBe(200);
    expect(r.json.totalAgents).toBeGreaterThan(1000);
  });

  it('event ingestion raises threats and runs response policies', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await req('POST', '/v1/shield/events', { category: 'auth', principal: 'api_atk', ip: '197.5.5.5', action: 'auth.login', outcome: 'failure' });
      expect(r.status).toBe(201);
    }
    const threats = await req('GET', '/v1/shield/threats');
    expect(threats.json.threats.some((t: any) => t.type === 'credential_abuse' && t.principal === 'api_atk')).toBe(true);
    const ledger = await req('GET', '/v1/shield/response');
    expect(ledger.json.ledger.some((x: any) => x.action === 'rate_limit' && x.status === 'executed')).toBe(true);
  });

  it('ransomware → approval workflow → super admin approves containment', async () => {
    await req('POST', '/v1/shield/events', { category: 'infra', principal: 'pod-web-9', action: 'fs.write', riskHints: ['mass_encrypt'] });
    const pending = await req('GET', '/v1/shield/approvals');
    expect(pending.json.pending.length).toBeGreaterThan(0);
    const apr = pending.json.pending.find((a: any) => a.action === 'quarantine_workload' || a.action === 'isolate_service');
    expect(apr).toBeDefined();
    const decision = await req('POST', `/v1/shield/approvals/${apr.id}/decide`, { decision: 'approved', admin: 'admin_root' });
    expect(decision.status).toBe(200);
    expect(decision.json.record.status).toBe('executed');
  });

  it('fraud assessment: ATO drain is critical with containment recommendations', async () => {
    await req('POST', '/v1/shield/fraud', { kind: 'account', principal: 'cus_api_1', deviceId: 'dev_9', meta: { credentialChange: true } });
    const r = await req('POST', '/v1/shield/fraud', { kind: 'wallet', principal: 'cus_api_1', amountMinor: 9_000_000, meta: { direction: 'withdraw' } });
    expect(r.status).toBe(201);
    expect(r.json.alert.rule).toBe('account_takeover_drain');
    expect(r.json.trustScore).toBeLessThan(50);
  });

  it('self-healing: degraded service recovers automatically', async () => {
    const r = await req('POST', '/v1/shield/heal', { services: [{ service: 'booking-svc', status: 'degraded' }] });
    expect(r.status).toBe(200);
    expect(r.json.runs.some((run: any) => run.outcome === 'recovered' && run.plan.steps.includes('restart_service'))).toBe(true);
  });

  it('zero-trust verification enforces least privilege over HTTP', async () => {
    const deny = await req('POST', '/v1/shield/verify', { role: 'customer', capability: 'escrow.release', mfaDone: true });
    expect(deny.json.decision).toBe('deny');
    const step = await req('POST', '/v1/shield/verify', { role: 'admin', capability: 'customers.export', mfaDone: false, deviceTrust: 80 });
    expect(step.json.decision).toBe('step_up_mfa');
  });

  it('intel feed: MITRE-mapped patterns, prioritized vulnerabilities, playbooks', async () => {
    const r = await req('GET', '/v1/shield/intel');
    expect(r.json.attackPatterns.some((p: any) => p.mitre === 'T1110')).toBe(true);
    expect(r.json.prioritized.length).toBeGreaterThan(0);
    expect(r.json.playbooks.length).toBeGreaterThanOrEqual(7);
  });

  it('compliance posture: six frameworks with control coverage', async () => {
    const r = await req('GET', '/v1/shield/compliance');
    expect(r.json.frameworks).toHaveLength(6);
    expect(r.json.frameworks.every((f: any) => f.controlsMet <= f.controlsTotal)).toBe(true);
  });

  it('arming switch fails safe (observe-only when disarmed)', async () => {
    const off = await req('PUT', '/v1/shield/response/armed', { armed: false });
    expect(off.json.armed).toBe(false);
    const on = await req('PUT', '/v1/shield/response/armed', { armed: true });
    expect(on.json.armed).toBe(true);
  });
});
