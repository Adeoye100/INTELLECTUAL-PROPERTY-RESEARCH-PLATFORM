import http from 'k6/http'; import { check, sleep } from 'k6'; import { loadConfig, thresholds } from './config.js';
export const options = { vus: 2, duration: '30s', thresholds, tags: { profile: 'staged' } };
export default function () { const c = loadConfig(); const r = http.get(`${c.base}/search?mark=ORCHID&jurisdiction=US&jurisdiction=EU`, { headers: c.headers, tags: { scenario: 'federated' }, timeout: '15s' }); check(r, { 'federated response is bounded': (x) => [200, 401, 403, 404].includes(x.status) }); sleep(1); }
