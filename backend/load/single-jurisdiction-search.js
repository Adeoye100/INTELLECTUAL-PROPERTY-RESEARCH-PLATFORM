import http from 'k6/http';
import { Counter, Rate } from 'k6/metrics';
import { check } from 'k6';
import { loadTestConfig, safeJson } from './config.js';

const config = loadTestConfig({ scenario: 'single-search', p95TargetMs: 2_000 });
const partialSourceRate = new Rate('partial_source_rate');
const sourceStatus = new Counter('source_status');
const timeoutRate = new Rate('load_timeout_rate');
export const options = config.options;

export default function singleJurisdictionSearch() {
  const response = http.get(`${config.baseUrl}/api/v1/search?mark=LOADTEST&jurisdiction=US`, { headers: config.headers, timeout: '6s' });
  timeoutRate.add(response.timings.duration === 0 || response.error_code === 1050);
  const body = safeJson(response);
  partialSourceRate.add(body?.partial === true);
  for (const status of body?.sourceStatuses ?? []) sourceStatus.add(1, { source: String(status.source).slice(0, 64), status: String(status.status).slice(0, 32) });
  check(response, { 'search response is successful': (value) => value.status === 200 });
}
