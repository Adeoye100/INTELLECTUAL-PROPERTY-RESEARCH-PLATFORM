const PRODUCTION_HOST = /(^|[.-])(prod|production|live)([.-]|$)/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function runtimeEnv() {
  if (typeof __ENV === 'object') return __ENV;
  if (typeof process !== 'undefined') return process.env;
  return {};
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for load testing.`);
  return value;
}

const PROFILES = Object.freeze({
  smoke: { vus: 1, duration: '15s', stages: [{ duration: '5s', target: 1 }, { duration: '5s', target: 1 }, { duration: '5s', target: 0 }] },
  staged: { vus: 10, duration: '4m', stages: [{ duration: '1m', target: 2 }, { duration: '2m', target: 10 }, { duration: '1m', target: 0 }] },
});

export function loadTestConfig({ scenario, p95TargetMs, env = runtimeEnv() } = {}) {
  if (typeof scenario !== 'string' || !/^[a-z0-9-]{2,40}$/.test(scenario)) throw new Error('A safe load-test scenario name is required.');
  if (!Number.isSafeInteger(p95TargetMs) || p95TargetMs < 1) throw new Error('A positive P95 target is required.');
  const baseUrl = new URL(required(env, 'LOAD_TEST_BASE_URL'));
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error('LOAD_TEST_BASE_URL must be a credential-free HTTP(S) origin without query or fragment.');
  }
  if (LOOPBACK_HOSTS.has(baseUrl.hostname) && env.ALLOW_LOCAL_MOCK_LOAD_TEST !== 'true') {
    throw new Error('Loopback targets require ALLOW_LOCAL_MOCK_LOAD_TEST=true.');
  }
  if (PRODUCTION_HOST.test(baseUrl.hostname) && env.ALLOW_PRODUCTION_LOAD_TEST !== 'true') {
    throw new Error('Production-looking targets require ALLOW_PRODUCTION_LOAD_TEST=true.');
  }
  const profileName = env.LOAD_TEST_PROFILE?.trim() || 'smoke';
  const profile = PROFILES[profileName];
  if (!profile) throw new Error('LOAD_TEST_PROFILE must be smoke or staged.');
  if (profileName !== 'smoke' && env.ALLOW_LARGER_LOAD_TEST !== 'true') {
    throw new Error('Larger load profiles require ALLOW_LARGER_LOAD_TEST=true.');
  }
  const token = required(env, 'LOAD_TEST_ACCESS_TOKEN');
  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ''), profileName, profile,
    headers: { Authorization: `Bearer ${token}`, 'X-Load-Test': `iprp-safe-${scenario}` },
    options: {
      stages: profile.stages,
      thresholds: {
        http_req_duration: [`p(95)<${p95TargetMs}`],
        http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' }],
        load_timeout_rate: ['rate<0.01'],
      },
      tags: { suite: 'iprp-backend', scenario },
    },
  };
}

export function safeJson(response) {
  try { return response.json(); } catch { return null; }
}

export function assertDashboardAggregateAvailable(env = runtimeEnv()) {
  if (env.DASHBOARD_API_PATH) {
    throw new Error('No documented backend dashboard aggregate endpoint is mounted; DASHBOARD_API_PATH cannot override that boundary.');
  }
  throw new Error('Dashboard P95 testing is blocked until a documented backend aggregate endpoint exists.');
}
