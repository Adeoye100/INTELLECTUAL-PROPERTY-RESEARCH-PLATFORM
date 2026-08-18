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

  return {
    port: positiveInteger(env, 'PORT', 3000),
    databaseUrl: required(env, 'DATABASE_URL'),
    databaseSsl: env.DATABASE_SSL === 'true',
    redisUrl: required(env, 'REDIS_URL'),
    jwtAccessSecret,
    inviteTokenTtlSeconds: positiveInteger(env, 'INVITE_TOKEN_TTL_SECONDS', 604_800),
    ...supabaseConfig,
    ...loadSearchConfig(env),
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
