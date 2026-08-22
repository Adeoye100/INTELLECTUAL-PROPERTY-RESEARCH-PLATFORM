import { randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 15_000;
const SAFE_ENVIRONMENT_LABEL = /(?:^|[.-])(staging|stage|sandbox|test|qa|dev|preview)(?:[.-]|$)/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimEnvironmentValue(environment, name) {
  const value = environment[name];
  return typeof value === 'string' ? value.trim() : '';
}

function boundedTimeout(value) {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error('STAGING_SMOKE_TIMEOUT_MS must be an integer between 250 and 15000.');
  }
  return timeoutMs;
}

function stagingApiUrl(value, allowUnsafeUrl) {
  if (!value) throw new Error('STAGING_API_URL is required.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('STAGING_API_URL must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('STAGING_API_URL must be a credential-free HTTP(S) URL without query or fragment.');
  }
  const hostname = url.hostname.toLowerCase();
  const local = hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
  const safeNamedEnvironment = SAFE_ENVIRONMENT_LABEL.test(hostname) || hostname.endsWith('.test');
  if (!allowUnsafeUrl && (local || !safeNamedEnvironment)) {
    throw new Error('STAGING_API_URL must name a non-local staging/test environment unless STAGING_SMOKE_ALLOW_UNSAFE_URL=true.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname && pathname !== '/api/v1') {
    throw new Error('STAGING_API_URL must be the service root or end with /api/v1.');
  }
  url.pathname = pathname || '/api/v1';
  return url.toString().replace(/\/$/, '');
}

function requiredCredential(environment, name) {
  const value = trimEnvironmentValue(environment, name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseStagingSmokeConfig(environment = process.env) {
  const allowUnsafeUrl = trimEnvironmentValue(environment, 'STAGING_SMOKE_ALLOW_UNSAFE_URL') === 'true';
  const allowMutations = trimEnvironmentValue(environment, 'STAGING_SMOKE_ALLOW_MUTATIONS') === 'true';
  const config = {
    apiUrl: stagingApiUrl(trimEnvironmentValue(environment, 'STAGING_API_URL'), allowUnsafeUrl),
    accessToken: requiredCredential(environment, 'STAGING_ACCESS_TOKEN'),
    adminAccessToken: requiredCredential(environment, 'STAGING_ADMIN_ACCESS_TOKEN'),
    mutationAccessToken: trimEnvironmentValue(environment, 'STAGING_MUTATION_ACCESS_TOKEN') || null,
    invitationToken: trimEnvironmentValue(environment, 'STAGING_INVITATION_TOKEN') || null,
    allowMutations,
    timeoutMs: boundedTimeout(trimEnvironmentValue(environment, 'STAGING_SMOKE_TIMEOUT_MS')),
  };
  if (allowMutations && !config.mutationAccessToken) {
    throw new Error('STAGING_MUTATION_ACCESS_TOKEN is required when STAGING_SMOKE_ALLOW_MUTATIONS=true.');
  }
  return Object.freeze(config);
}

function endpointUrl(apiUrl, pathname) {
  return new URL(pathname.replace(/^\//, ''), `${apiUrl}/`).toString();
}

function responseCode(body) {
  if (!body || typeof body !== 'object') return null;
  const code = body.code ?? body.error?.code;
  return typeof code === 'string' && code.length <= 100 ? code : null;
}

async function safeResponseSummary(response, { readBody = false } = {}) {
  if (!readBody) return { status: response.status, code: null, body: null };
  try {
    const body = await response.json();
    return { status: response.status, code: responseCode(body), body };
  } catch {
    return { status: response.status, code: null, body: null };
  }
}

function reportResult(results, name, outcome, detail = null) {
  results.push(Object.freeze({ name, outcome, detail }));
}

async function requestCheck({ fetchImplementation, config, results, name, method = 'GET', pathname, token, body, expectedStatuses, readBody = false }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImplementation(endpointUrl(config.apiUrl, pathname), {
      method,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const summary = await safeResponseSummary(response, { readBody });
    if (expectedStatuses.includes(summary.status)) {
      reportResult(results, name, 'PASS');
      return summary;
    }
    reportResult(results, name, 'FAIL', summary.code ?? `HTTP_${summary.status}`);
    return summary;
  } catch (error) {
    reportResult(results, name, 'FAIL', error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
    return { status: null, code: null, body: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Executes only authenticated GET checks by default. Mutations require both an
 * explicit flag and a dedicated mutation token, and cleanup is constrained to
 * the UUID returned by this invocation's create response.
 */
export async function runStagingSmoke({ config, fetchImplementation = globalThis.fetch, idGenerator = randomUUID } = {}) {
  if (!config) throw new TypeError('runStagingSmoke requires parsed configuration.');
  if (typeof fetchImplementation !== 'function') throw new TypeError('runStagingSmoke requires fetch.');
  const results = [];
  const readChecks = [
    ['authenticated identity', '/me', config.accessToken],
    ['portfolio marks', '/portfolio-marks?pageSize=1', config.accessToken],
    ['watches', '/watches?pageSize=1', config.accessToken],
    ['alerts', '/alerts?pageSize=1', config.accessToken],
    ['search', '/search?mark=PHASE2SMOKE', config.accessToken],
    ['admin audit logs', '/audit-logs?pageSize=1', config.adminAccessToken],
    ['admin authorization', '/admin/ping', config.adminAccessToken],
  ];
  for (const [name, pathname, token] of readChecks) {
    await requestCheck({ fetchImplementation, config, results, name, pathname, token, expectedStatuses: [200] });
  }
  if (config.invitationToken) {
    await requestCheck({
      fetchImplementation, config, results, name: 'invitation details',
      pathname: `/auth/invitations/${encodeURIComponent(config.invitationToken)}`,
      token: config.accessToken, expectedStatuses: [200],
    });
  } else {
    reportResult(results, 'invitation details', 'SKIP', 'STAGING_INVITATION_TOKEN_NOT_PROVIDED');
  }

  if (!config.allowMutations) {
    reportResult(results, 'controlled portfolio mutation and cleanup', 'SKIP', 'MUTATIONS_NOT_ENABLED');
  } else {
    const marker = `PHASE2_SMOKE_${idGenerator().replaceAll('-', '')}`;
    const created = await requestCheck({
      fetchImplementation,
      config,
      results,
      name: 'create controlled portfolio mark',
      method: 'POST',
      pathname: '/portfolio-marks',
      token: config.mutationAccessToken,
      body: {
        markText: marker,
        jurisdiction: 'US',
        sourceRegistry: 'USPTO',
        registryReference: marker,
        niceClasses: [9],
        status: 'pending',
        filingDate: null,
        registrationDate: null,
        renewalDate: null,
      },
      expectedStatuses: [201],
      readBody: true,
    });
    const recordId = typeof created.body?.id === 'string' && UUID_PATTERN.test(created.body.id)
      ? created.body.id
      : null;
    if (recordId) {
      await requestCheck({
        fetchImplementation, config, results, name: 'update controlled portfolio mark', method: 'PATCH',
        pathname: `/portfolio-marks/${encodeURIComponent(recordId)}`, token: config.mutationAccessToken,
        body: { status: 'filed' }, expectedStatuses: [200],
      });
      await requestCheck({
        fetchImplementation, config, results, name: 'cleanup controlled portfolio mark', method: 'DELETE',
        pathname: `/portfolio-marks/${encodeURIComponent(recordId)}`, token: config.mutationAccessToken,
        expectedStatuses: [204],
      });
    } else {
      reportResult(results, 'verify controlled portfolio mark ID', 'FAIL', 'CREATE_RESPONSE_ID_INVALID');
      reportResult(results, 'update controlled portfolio mark', 'SKIP', 'CREATE_DID_NOT_RETURN_ID');
      reportResult(results, 'cleanup controlled portfolio mark', 'SKIP', 'CREATE_DID_NOT_RETURN_ID');
    }
  }

  const totals = Object.freeze({
    pass: results.filter((result) => result.outcome === 'PASS').length,
    fail: results.filter((result) => result.outcome === 'FAIL').length,
    skip: results.filter((result) => result.outcome === 'SKIP').length,
  });
  return Object.freeze({ results: Object.freeze(results), totals, ok: totals.fail === 0 });
}
