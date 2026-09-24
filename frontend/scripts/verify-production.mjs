import assert from 'node:assert/strict';

const appOrigin = new URL(process.env.IPRP_APP_ORIGIN ?? 'https://fgiprp.com').origin;
const apiBase = (process.env.IPRP_API_BASE_URL ?? 'https://iprp-api.onrender.com/api/v1').replace(/\/+$/, '');
const apiOrigin = new URL(apiBase).origin;
const routes = ['/dashboard', '/auth/callback', '/auth/verify-email', '/auth/reset-password'];
const requiredHeaders = {
  'content-security-policy': ["default-src 'self'", "frame-ancestors 'none'", apiOrigin],
  'strict-transport-security': ['max-age=31536000'],
  'x-content-type-options': ['nosniff'],
  'x-frame-options': ['DENY'],
  'referrer-policy': ['strict-origin-when-cross-origin'],
  'permissions-policy': ['camera=()', 'microphone=()'],
};

const results = {
  checkedAt: new Date().toISOString(),
  status: 'running',
  appOrigin,
  apiBase,
  routes: {},
  api: {},
  roles: {},
};

async function request(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60_000), ...options });
  const text = await response.text();
  return { response, text };
}

async function verify() {
  for (const route of routes) {
    const { response, text } = await request(`${appOrigin}${route}`, { headers: { 'cache-control': 'no-cache' } });
    assert.equal(response.status, 200, `${route} did not serve the SPA.`);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/i, `${route} did not return HTML.`);
    assert.match(text, /<div[^>]+id=["']root["']/i, `${route} did not return the application shell.`);
    for (const [name, fragments] of Object.entries(requiredHeaders)) {
      const value = response.headers.get(name);
      assert(value, `${route} is missing ${name}.`);
      for (const fragment of fragments) assert(value.includes(fragment), `${route} ${name} is missing ${fragment}.`);
    }
    results.routes[route] = { status: response.status, bytes: Buffer.byteLength(text) };
  }

  const readiness = await request(`${apiOrigin}/readyz`, { headers: { origin: appOrigin } });
  assert.equal(readiness.response.status, 200, 'Backend readiness failed.');
  assert.equal(readiness.response.headers.get('access-control-allow-origin'), appOrigin, 'Backend CORS does not allow the production app origin.');
  results.api.readiness = { status: readiness.response.status };

  const anonymousMe = await request(`${apiBase}/session-context`, { headers: { origin: appOrigin } });
  assert.equal(anonymousMe.response.status, 401, 'GET /session-context did not reject an anonymous request.');
  results.api.anonymousMe = { status: anonymousMe.response.status };

  const roleTokens = [
    ['admin', process.env.IPRP_ADMIN_TOKEN],
    ['attorney', process.env.IPRP_ATTORNEY_TOKEN],
    ['viewer', process.env.IPRP_VIEWER_TOKEN],
  ];

  for (const [role, token] of roleTokens) {
    if (!token) {
      results.roles[role] = { status: 'skipped', reason: `IPRP_${role.toUpperCase()}_TOKEN is not configured` };
      continue;
    }

    const headers = { origin: appOrigin, authorization: `Bearer ${token}` };
    const me = await request(`${apiBase}/session-context`, { headers });
    assert.equal(me.response.status, 200, `${role} token failed GET /session-context.`);
    const profile = JSON.parse(me.text);
    assert.equal(profile.role, role, `${role} token resolved to ${profile.role}.`);

    const portfolio = await request(`${apiBase}/portfolio-marks?page=1&pageSize=1`, { headers });
    assert.equal(portfolio.response.status, 200, `${role} could not access the shared portfolio read endpoint.`);

    const audit = await request(`${apiBase}/audit-logs?page=1&pageSize=1`, { headers });
    assert.equal(audit.response.status, role === 'admin' ? 200 : 403, `${role} audit-log authorization did not match policy.`);
    results.roles[role] = { status: 'passed', profile: 200, portfolio: 200, audit: audit.response.status };
  }

  results.status = 'passed';
}

try {
  await verify();
} catch (error) {
  results.status = 'failed';
  results.error = {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(results, null, 2));
}
