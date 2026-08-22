export function loadConfig() {
  const base = String(__ENV.LOAD_TEST_BASE_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('LOAD_TEST_BASE_URL is required.');
  const host = new URL(base).hostname;
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  const productionLooking = /(^|\.)prod(uction)?\.|api\./i.test(host);
  if (productionLooking && __ENV.ALLOW_PRODUCTION_LOAD_TEST !== 'true') throw new Error('Production-looking hosts require explicit opt-in.');
  return { base, token: String(__ENV.LOAD_TEST_TOKEN || ''), headers: { 'X-IPRP-Load-Test': 'vz-03', ...( __ENV.LOAD_TEST_TOKEN ? { Authorization: `Bearer ${__ENV.LOAD_TEST_TOKEN}` } : {}) }, local };
}
export const thresholds = { http_req_failed: ['rate<0.05'], 'http_req_duration{scenario:single-jurisdiction}': ['p(95)<2000'], 'http_req_duration{scenario:federated}': ['p(95)<5000'], 'http_req_duration{scenario:dashboard}': ['p(95)<1500'] };
