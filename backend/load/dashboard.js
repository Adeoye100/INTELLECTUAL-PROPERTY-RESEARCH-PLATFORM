import http from 'k6/http'; import { check, sleep } from 'k6'; import { loadConfig, thresholds } from './config.js';
export const options = { vus: 2, duration: '30s', thresholds, tags: { profile: 'staged' } };
export default function () { const c = loadConfig(); const r = http.get(`${c.base}/dashboard/analytics?range=30d`, { headers: c.headers, tags: { scenario: 'dashboard' }, timeout: '10s' }); check(r, { 'aggregate response is bounded': (x) => [200, 401, 403].includes(x.status) }); sleep(1); }
