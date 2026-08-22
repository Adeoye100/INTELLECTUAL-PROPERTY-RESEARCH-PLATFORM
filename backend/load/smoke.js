import http from 'k6/http';
import { check } from 'k6';
import { loadTestConfig } from './config.js';

const config = loadTestConfig({ scenario: 'smoke', p95TargetMs: 2_000 });
export const options = { ...config.options, vus: 1, iterations: 1 };

export default function smoke() {
  const response = http.get(`${config.baseUrl}/healthz`, { headers: { 'X-Load-Test': 'iprp-safe-smoke' }, timeout: '3s' });
  check(response, { 'health endpoint is available': (value) => value.status === 200 });
}
