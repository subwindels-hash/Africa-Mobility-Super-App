#!/usr/bin/env node
/**
 * Zero-dependency HTTP load test for the AMSA API.
 *   node scripts/load/api-load.mjs [durationSec] [concurrency] [baseUrl]
 * Measures per-endpoint p50/p95/p99 latency, throughput, and error rate —
 * the executable counterpart to scripts/load/k6-api.js (CI standard).
 */
const durationSec = Number(process.argv[2] ?? 15);
const concurrency = Number(process.argv[3] ?? 25);
const BASE = process.argv[4] ?? process.env.E2E_API ?? 'http://localhost:4000';

const url = (p) => new URL(p, BASE);
const scenarios = [
  { name: 'GET /v1/health', init: { method: 'GET', path: '/v1/health' } },
  {
    name: 'POST /v1/bookings/estimate',
    init: {
      method: 'POST', path: '/v1/bookings/estimate',
      body: { pickup: { lat: 6.5244, lng: 3.3792 }, dropoff: { lat: 6.4541, lng: 3.3947 }, service: 'ride.standard' },
    },
  },
  {
    name: 'GET /v1/geo/route',
    init: { method: 'GET', path: '/v1/geo/route?origin=6.5244,3.3792&destination=9.0579,7.4911' },
  },
  { name: 'GET /v1/interstate/catalog', init: { method: 'GET', path: '/v1/interstate/catalog' } },
];

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);

async function hit(scen, agent) {
  const t0 = performance.now();
  try {
    const res = await fetch(url(scen.init.path), {
      method: scen.init.method,
      headers: { 'content-type': 'application/json' },
      body: scen.init.body ? JSON.stringify(scen.init.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    await res.arrayBuffer(); // drain
    return { ms: performance.now() - t0, ok: res.ok };
  } catch {
    return { ms: performance.now() - t0, ok: false };
  }
}

async function runScenario(scen) {
  const lat = [];
  let n = 0, errors = 0;
  const deadline = performance.now() + durationSec * 1000;
  const workers = Array.from({ length: concurrency }, async () => {
    while (performance.now() < deadline) {
      const r = await hit(scen);
      lat.push(r.ms); n++;
      if (!r.ok) errors++;
    }
  });
  await Promise.all(workers);
  lat.sort((a, b) => a - b);
  const wall = durationSec;
  return {
    scenario: scen.name,
    requests: n,
    rps: +(n / wall).toFixed(1),
    errors,
    errorPct: +((errors / Math.max(n, 1)) * 100).toFixed(2),
    p50ms: +pct(lat, 0.5).toFixed(1),
    p95ms: +pct(lat, 0.95).toFixed(1),
    p99ms: +pct(lat, 0.99).toFixed(1),
  };
}

console.log(`AMSA load test — ${BASE} | ${durationSec}s @ ${concurrency} concurrent per scenario\n`);
const results = [];
for (const s of scenarios) results.push(await runScenario(s));

const w = [30, 8, 8, 9, 9, 9, 7];
const row = (c, i) => String(c).padEnd(w[i]);
console.log([row('scenario', 0), row('reqs', 1), row('rps', 2), row('p50', 3), row('p95', 4), row('p99', 5), row('err%')].join(''));
for (const r of results) {
  console.log([row(r.scenario, 0), row(r.requests, 1), row(r.rps, 2), row(r.p50ms + 'ms', 3), row(r.p95ms + 'ms', 4), row(r.p99ms + 'ms', 5), row(r.errorPct)].join(''));
}
const total = results.reduce((a, r) => a + r.requests, 0);
const errs = results.reduce((a, r) => a + r.errors, 0);
console.log(`\nTOTAL ${total} requests, ${errs} errors (${((errs / Math.max(total, 1)) * 100).toFixed(2)}%) in ~${durationSec * results.length}s`);
process.exit(errs / Math.max(total, 1) > 0.02 ? 1 : 0); // fail above 2% errors
