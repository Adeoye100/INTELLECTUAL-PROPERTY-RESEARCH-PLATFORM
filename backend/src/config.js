function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(env, name, fallback) {
  const raw = env[name] ?? String(fallback);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

const SUPABASE_VERIFICATION_MODES = new Set(['jwks', 'auth-server']);
const SUPABASE_ASYMMETRIC_ALGORITHMS = new Set(['ES256', 'RS256']);
const SEARCH_REGISTRY_NAME = /^[A-Z0-9_-]+$/;
const MIN_SEARCH_TIMEOUT_MS = 100;
const MAX_SEARCH_TIMEOUT_MS = 60_000;

function searchEnabled(env) {
  const value = env.SEARCH_ENABLED?.trim() || 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error('SEARCH_ENABLED must be either true or false.');
  }
  return value === 'true';
}

function watchEnabled(env) {
  const value = env.WATCH_ENABLED?.trim() || 'false';
  if (value !== 'true' && value !== 'false') throw new Error('WATCH_ENABLED must be either true or false.');
  return value === 'true';
}

function strictBoolean(env, name, fallback) {
  const value = env[name] === undefined ? String(fallback) : env[name].trim();
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be either true or false.`);
  return value === 'true';
}

function nonNegativeBoundedInteger(env, name, fallback, maximum) {
  const raw = env[name] ?? String(fallback);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 0 and ${maximum}.`);
  }
  return value;
}

function loadAuthRateLimitConfig(env, jwtAccessSecret, supabaseSecretKey) {
  const authRateLimitEnabled = strictBoolean(env, 'AUTH_RATE_LIMIT_ENABLED', true);
  const trustProxyHops = nonNegativeBoundedInteger(env, 'TRUST_PROXY_HOPS', 0, 10);
  if (!authRateLimitEnabled) {
    const environment = env.NODE_ENV?.trim();
    if (!['development', 'test'].includes(environment)) {
      throw new Error('AUTH_RATE_LIMIT_ENABLED may be false only in development or test environments.');
    }
    return { authRateLimitEnabled, trustProxyHops, authRateLimitKeySecret: undefined, authRateLimitPolicies: undefined };
  }

  const authRateLimitKeySecret = required(env, 'AUTH_RATE_LIMIT_KEY_SECRET');
  if (Buffer.byteLength(authRateLimitKeySecret, 'utf8') < 32) {
    throw new Error('AUTH_RATE_LIMIT_KEY_SECRET must contain at least 32 bytes.');
  }
  if ([jwtAccessSecret, supabaseSecretKey].includes(authRateLimitKeySecret)) {
    throw new Error('AUTH_RATE_LIMIT_KEY_SECRET must be separate from authentication secrets.');
  }
  const loginLimit = boundedPositiveInteger(env, 'AUTH_LOGIN_IP_LIMIT', 20, 1, 10_000);
  const loginIdentityLimit = boundedPositiveInteger(env, 'AUTH_LOGIN_IDENTITY_LIMIT', 5, 1, 10_000);
  const loginWindowSeconds = boundedPositiveInteger(env, 'AUTH_LOGIN_WINDOW_SECONDS', 900, 1, 86_400);
  const recoveryLimit = boundedPositiveInteger(env, 'AUTH_RECOVERY_LIMIT', 5, 1, 10_000);
  const recoveryWindowSeconds = boundedPositiveInteger(env, 'AUTH_RECOVERY_WINDOW_SECONDS', 3_600, 1, 86_400);
  const refreshLimit = boundedPositiveInteger(env, 'AUTH_REFRESH_LIMIT', 30, 1, 10_000);
  const refreshWindowSeconds = boundedPositiveInteger(env, 'AUTH_REFRESH_WINDOW_SECONDS', 300, 1, 86_400);
  return {
    authRateLimitEnabled,
    trustProxyHops,
    authRateLimitKeySecret,
    authRateLimitPolicies: {
      loginIp: { limit: loginLimit, windowSeconds: loginWindowSeconds },
      loginIdentity: { limit: loginIdentityLimit, windowSeconds: loginWindowSeconds },
      recoveryIp: { limit: recoveryLimit, windowSeconds: recoveryWindowSeconds },
      recoveryIdentity: { limit: recoveryLimit, windowSeconds: recoveryWindowSeconds },
      refreshSession: { limit: refreshLimit, windowSeconds: refreshWindowSeconds },
      logoutIp: { limit: 60, windowSeconds: 60 },
    },
  };
}

function loadWatchConfig(env) {
  const enabled = watchEnabled(env);
  return {
    watchEnabled: enabled,
    watchSchedulerIntervalMs: boundedPositiveInteger(
      env, 'WATCH_SCHEDULER_INTERVAL_MS', 60_000, 1_000, 3_600_000,
    ),
    watchPollIntervalMinutes: boundedPositiveInteger(
      env, 'WATCH_POLL_INTERVAL_MINUTES', 1_440, 5, 43_200,
    ),
    watchSchedulerBatchSize: boundedPositiveInteger(
      env, 'WATCH_SCHEDULER_BATCH_SIZE', 50, 1, 100,
    ),
  };
}

function elasticsearchSearchUrl(env) {
  const raw = required(env, 'ELASTICSEARCH_URL');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('ELASTICSEARCH_URL must be a valid HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('ELASTICSEARCH_URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('ELASTICSEARCH_URL must not contain credentials, a query, or a fragment.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function searchRegistries(env) {
  const raw = required(env, 'SEARCH_SOURCE_REGISTRIES');
  const registries = raw.split(',').map((registry) => registry.trim().toUpperCase());
  if (registries.length === 0 || registries.some((registry) => !SEARCH_REGISTRY_NAME.test(registry))) {
    throw new Error('SEARCH_SOURCE_REGISTRIES must be a comma-separated list of registry names using A-Z, 0-9, underscore, or hyphen.');
  }
  const uniqueRegistries = [...new Set(registries)];
  if (uniqueRegistries.length > 20) {
    throw new Error('SEARCH_SOURCE_REGISTRIES may contain no more than 20 registries.');
  }
  return uniqueRegistries;
}

function boundedPositiveInteger(env, name, fallback, minimum, maximum) {
  const value = positiveInteger(env, name, fallback);
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function loadSearchConfig(env) {
  const enabled = searchEnabled(env);
  if (!enabled) {
    return {
      searchEnabled: false,
      elasticsearchUrl: undefined,
      searchSourceRegistries: [],
      searchSourceTimeoutMs: boundedPositiveInteger(
        env, 'SEARCH_SOURCE_TIMEOUT_MS', 3_000, MIN_SEARCH_TIMEOUT_MS, MAX_SEARCH_TIMEOUT_MS,
      ),
      searchMaxResults: boundedPositiveInteger(env, 'SEARCH_MAX_RESULTS', 50, 1, 100),
    };
  }
  return {
    searchEnabled: true,
    elasticsearchUrl: elasticsearchSearchUrl(env),
    searchSourceRegistries: searchRegistries(env),
    searchSourceTimeoutMs: boundedPositiveInteger(
      env, 'SEARCH_SOURCE_TIMEOUT_MS', 3_000, MIN_SEARCH_TIMEOUT_MS, MAX_SEARCH_TIMEOUT_MS,
    ),
    searchMaxResults: boundedPositiveInteger(env, 'SEARCH_MAX_RESULTS', 50, 1, 100),
  };
}

function officeActionSearchEnabled(env) {
  const value = env.OFFICE_ACTION_SEARCH_ENABLED?.trim() || 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error('OFFICE_ACTION_SEARCH_ENABLED must be either true or false.');
  }
  return value === 'true';
}

function officeActionRegistries(env) {
  const raw = required(env, 'OFFICE_ACTION_SOURCE_REGISTRIES');
  const registries = raw.split(',').map((registry) => registry.trim().toUpperCase());
  if (registries.length === 0 || registries.some((registry) => !SEARCH_REGISTRY_NAME.test(registry))) {
    throw new Error('OFFICE_ACTION_SOURCE_REGISTRIES must be a comma-separated list of registry names using A-Z, 0-9, underscore, or hyphen.');
  }
  const uniqueRegistries = [...new Set(registries)];
  if (uniqueRegistries.length > 20) {
    throw new Error('OFFICE_ACTION_SOURCE_REGISTRIES may contain no more than 20 registries.');
  }
  return uniqueRegistries;
}

function loadOfficeActionSearchConfig(env) {
  const enabled = officeActionSearchEnabled(env);
  const timeoutMs = boundedPositiveInteger(
    env, 'OFFICE_ACTION_SOURCE_TIMEOUT_MS', 3_000, MIN_SEARCH_TIMEOUT_MS, MAX_SEARCH_TIMEOUT_MS,
  );
  const maxResults = boundedPositiveInteger(env, 'OFFICE_ACTION_SEARCH_MAX_RESULTS', 25, 1, 100);
  if (!enabled) {
    return {
      officeActionSearchEnabled: false,
      officeActionSourceRegistries: [],
      officeActionSourceTimeoutMs: timeoutMs,
      officeActionSearchMaxResults: maxResults,
    };
  }
  return {
    officeActionSearchEnabled: true,
    officeActionSourceRegistries: officeActionRegistries(env),
    officeActionSourceTimeoutMs: timeoutMs,
    officeActionSearchMaxResults: maxResults,
  };
}

function loadPdfExportConfig(env) {
  const pdfExportEnabled = strictBoolean(env, 'PDF_EXPORT_ENABLED', false);
  const pdfExportMaxBytes = boundedPositiveInteger(env, 'PDF_EXPORT_MAX_BYTES', 10 * 1024 * 1024, 32 * 1024, 100 * 1024 * 1024);
  const pdfExportMaxPages = boundedPositiveInteger(env, 'PDF_EXPORT_MAX_PAGES', 100, 1, 500);
  const pdfExportMaxResults = boundedPositiveInteger(env, 'PDF_EXPORT_MAX_RESULTS', 50, 1, 100);
  const pdfExportMaxAttempts = boundedPositiveInteger(env, 'PDF_EXPORT_MAX_ATTEMPTS', 3, 1, 10);
  const pdfExportWorkerIntervalMs = boundedPositiveInteger(env, 'PDF_EXPORT_WORKER_INTERVAL_MS', 1_000, 100, 60_000);
  const pdfExportWorkerMaxJobs = boundedPositiveInteger(env, 'PDF_EXPORT_WORKER_MAX_JOBS', 5, 1, 100);
  if (!pdfExportEnabled) return {
    pdfExportEnabled: false, pdfExportQueueKey: 'queue:pdf_export', pdfExportMaxBytes, pdfExportMaxPages,
    pdfExportMaxResults, pdfExportMaxAttempts, pdfExportWorkerIntervalMs, pdfExportWorkerMaxJobs,
    pdfExportStorageProvider: undefined, pdfExportStorageRoot: undefined,
  };
  const pdfExportQueueKey = env.PDF_EXPORT_QUEUE_KEY?.trim() || 'queue:pdf_export';
  if (!/^queue:[a-z0-9:_-]{1,100}$/.test(pdfExportQueueKey)) throw new Error('PDF_EXPORT_QUEUE_KEY is invalid.');
  const pdfExportStorageProvider = env.PDF_EXPORT_STORAGE_PROVIDER?.trim();
  if (pdfExportStorageProvider !== 'filesystem') throw new Error('PDF_EXPORT_STORAGE_PROVIDER must be filesystem when PDF export is enabled.');
  const pdfExportStorageRoot = env.PDF_EXPORT_STORAGE_ROOT?.trim();
  if (!pdfExportStorageRoot || !pdfExportStorageRoot.startsWith('/')) throw new Error('PDF_EXPORT_STORAGE_ROOT must be an absolute private storage path.');
  return {
    pdfExportEnabled: true, pdfExportQueueKey, pdfExportMaxBytes, pdfExportMaxPages, pdfExportMaxResults,
    pdfExportMaxAttempts, pdfExportWorkerIntervalMs, pdfExportWorkerMaxJobs, pdfExportStorageProvider, pdfExportStorageRoot,
  };
}

function supabaseUrl(env) {
  const raw = required(env, 'SUPABASE_URL');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SUPABASE_URL must be a valid absolute URL.');
  }

  const isLoopbackHttp = url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLoopbackHttp) {
    throw new Error('SUPABASE_URL must use HTTPS (HTTP is allowed only for loopback testing).');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('SUPABASE_URL must not contain credentials, a query, or a fragment.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function verificationMode(env) {
  const mode = required(env, 'SUPABASE_JWT_VERIFICATION_MODE');
  if (!SUPABASE_VERIFICATION_MODES.has(mode)) {
    throw new Error('SUPABASE_JWT_VERIFICATION_MODE must be either jwks or auth-server.');
  }
  return mode;
}

function asymmetricAlgorithms(env, mode) {
  if (mode !== 'jwks') return [];

  const algorithms = required(env, 'SUPABASE_JWT_ALGORITHMS')
    .split(',')
    .map((algorithm) => algorithm.trim())
    .filter(Boolean);
  if (algorithms.length === 0 || algorithms.some(
    (algorithm) => !SUPABASE_ASYMMETRIC_ALGORITHMS.has(algorithm),
  )) {
    throw new Error('SUPABASE_JWT_ALGORITHMS may contain only ES256 and/or RS256.');
  }
  return [...new Set(algorithms)];
}

export function loadSupabaseConfig(env = process.env) {
  const supabaseJwtVerificationMode = verificationMode(env);
  const supabasePublishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim() || undefined;
  const supabaseSecretKey = env.SUPABASE_SECRET_KEY?.trim() || undefined;
  if (supabaseJwtVerificationMode === 'auth-server' && !supabasePublishableKey) {
    throw new Error('Missing required environment variable: SUPABASE_PUBLISHABLE_KEY');
  }

  return {
    supabaseUrl: supabaseUrl(env),
    supabasePublishableKey,
    supabaseSecretKey,
    supabaseJwtVerificationMode,
    supabaseJwtAlgorithms: asymmetricAlgorithms(env, supabaseJwtVerificationMode),
  };
}

export function loadConfig(env = process.env) {
  const jwtAccessSecret = required(env, 'JWT_ACCESS_SECRET');
  if (Buffer.byteLength(jwtAccessSecret, 'utf8') < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes.');
  }

  const supabaseConfig = loadSupabaseConfig(env);
  if (!supabaseConfig.supabaseSecretKey) {
    throw new Error('Missing required environment variable: SUPABASE_SECRET_KEY');
  }
  const searchConfig = loadSearchConfig(env);
  const officeActionSearchConfig = loadOfficeActionSearchConfig(env);
  const pdfExportConfig = loadPdfExportConfig(env);
  const watchConfig = loadWatchConfig(env);
  if (watchConfig.watchEnabled && !searchConfig.searchEnabled) {
    throw new Error('WATCH_ENABLED requires SEARCH_ENABLED=true.');
  }
  const authRateLimitConfig = loadAuthRateLimitConfig(
    env, jwtAccessSecret, supabaseConfig.supabaseSecretKey,
  );

  return {
    port: positiveInteger(env, 'PORT', 3000),
    databaseUrl: required(env, 'DATABASE_URL'),
    databaseSsl: env.DATABASE_SSL === 'true',
    redisUrl: required(env, 'REDIS_URL'),
    jwtAccessSecret,
    inviteTokenTtlSeconds: positiveInteger(env, 'INVITE_TOKEN_TTL_SECONDS', 604_800),
    ...supabaseConfig,
    ...searchConfig,
    ...officeActionSearchConfig,
    ...pdfExportConfig,
    ...watchConfig,
    ...authRateLimitConfig,
  };
}

export function loadUsptoIngestionConfig(env = process.env) {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    usptoBulkListingUrl: env.USPTO_BULK_LISTING_URL?.trim() || undefined,
  };
}

export function loadElasticsearchSyncConfig(env = process.env) {
  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    elasticsearchUrl: required(env, 'ELASTICSEARCH_URL'),
    elasticsearchIndex: env.ELASTICSEARCH_INDEX?.trim() || 'trademarks_composite',
  };
}

export function loadElasticsearchIndexConfig(env = process.env) {
  return {
    elasticsearchUrl: required(env, 'ELASTICSEARCH_URL'),
  };
}
