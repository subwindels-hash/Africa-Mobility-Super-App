import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 load suite — CI standard (companion to api-load.mjs).
 *   k6 run -e BASE=http://localhost:4000 scripts/load/k6-api.js
 * Thresholds enforce SLOs: p95 < 250ms, error rate < 2%.
 */
const BASE = __ENV.BASE || 'http://localhost:4000';

export const options = {
  scenarios: {
    steady: { executor: 'constant-vus', vus: 25, duration: '60s' },
    spike: { executor: 'ramping-vus', startVUs: 0, stages: [
      { duration: '10s', target: 100 },
      { duration: '30s', target: 100 },
      { duration: '10s', target: 0 },
    ], startTime: '70s' },
  },
  thresholds: {
    http_req_duration: ['p(95)<250'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  const health = http.get(`${BASE}/v1/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  const est = http.post(`${BASE}/v1/bookings/estimate`, JSON.stringify({
    pickup: { lat: 6.5244, lng: 3.3792 },
    dropoff: { lat: 6.4541, lng: 3.3947 },
    service: 'ride.standard',
  }), { headers: { 'Content-Type': 'application/json' } });
  check(est, { 'estimate 200': (r) => r.status === 200 });

  sleep(0.2);
}
