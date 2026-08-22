import http from 'k6/http';
import { check, sleep } from 'k6';
import { loadConfig, thresholds } from './config.js';
export const options = { vus: 1, duration: '10s', thresholds, tags: { profile: 'smoke' } };
export default function () { const c = loadConfig(); const response = http.get(`${c.base}/dashboard/analytics?range=7d`, { headers: c.headers, tags: { scenario: 'dashboard' }, timeout: '10s' }); check(response, { 'dashboard request is safe': (r) => [200, 401, 403].includes(r.status) }); sleep(1); }
