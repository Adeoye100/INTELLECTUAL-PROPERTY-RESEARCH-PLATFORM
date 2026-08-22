import { loadConfig } from '../config.js';

const REQUIRED_COMPONENTS = Object.freeze([
  ['postgresql', 'PostgreSQL configuration'],
  ['redis', 'Redis configuration'],
  ['supabase', 'Supabase authentication configuration'],
  ['authSecrets', 'JWT and rate-limit secrets'],
  ['search', 'Elasticsearch search feature'],
  ['watchWorker', 'Watch worker'],
]);

function failure(code, message) {
  return { ok: false, code, message };
}

function success() {
  return { ok: true, code: null, message: null };
}

/**
 * Validates deployment configuration without creating network clients or
 * contacting infrastructure. `loadConfig` remains the authoritative parser.
 */
export function evaluatePhase2Readiness(environment = process.env) {
  let config;
  let configurationFailure = null;
  try {
    config = loadConfig(environment);
  } catch (error) {
    configurationFailure = error instanceof Error ? error.message : 'Application configuration is invalid.';
  }

  const checks = Object.fromEntries(REQUIRED_COMPONENTS.map(([name, label]) => [name, {
    component: label,
    ...failure('CONFIGURATION_INVALID', configurationFailure ?? 'Application configuration is invalid.'),
  }]));

  if (config) {
    checks.postgresql = { component: 'PostgreSQL configuration', ...success() };
    checks.redis = { component: 'Redis configuration', ...success() };
    checks.supabase = { component: 'Supabase authentication configuration', ...success() };
    checks.authSecrets = { component: 'JWT and rate-limit secrets', ...success() };
    checks.search = config.searchEnabled
      ? { component: 'Elasticsearch search feature', ...success() }
      : {
        component: 'Elasticsearch search feature',
        ...failure('SEARCH_DISABLED', 'SEARCH_ENABLED=true is required for Phase 2 staging verification.'),
      };
    checks.watchWorker = config.watchEnabled
      ? { component: 'Watch worker', ...success() }
      : {
        component: 'Watch worker',
        ...failure('WATCH_WORKER_DISABLED', 'WATCH_ENABLED=true is required for Phase 2 staging verification.'),
      };
  }

  const gates = Object.values(checks)
    .filter((check) => !check.ok)
    .map(({ component, code, message }) => ({ component, code, message }));

  return Object.freeze({
    ready: gates.length === 0,
    checks: Object.freeze(checks),
    gates: Object.freeze(gates),
  });
}
