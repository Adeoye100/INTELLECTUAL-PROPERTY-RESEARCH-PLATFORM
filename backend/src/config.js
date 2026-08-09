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
  if (supabaseJwtVerificationMode === 'auth-server' && !supabasePublishableKey) {
    throw new Error('Missing required environment variable: SUPABASE_PUBLISHABLE_KEY');
  }

  return {
    supabaseUrl: supabaseUrl(env),
    supabasePublishableKey,
    supabaseJwtVerificationMode,
    supabaseJwtAlgorithms: asymmetricAlgorithms(env, supabaseJwtVerificationMode),
  };
}

export function loadConfig(env = process.env) {
  const jwtAccessSecret = required(env, 'JWT_ACCESS_SECRET');
  if (Buffer.byteLength(jwtAccessSecret, 'utf8') < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes.');
  }

  return {
    port: positiveInteger(env, 'PORT', 3000),
    databaseUrl: required(env, 'DATABASE_URL'),
    databaseSsl: env.DATABASE_SSL === 'true',
    redisUrl: required(env, 'REDIS_URL'),
    jwtAccessSecret,
    jwtIssuer: env.JWT_ISSUER?.trim() || 'iprp-api',
    jwtAudience: env.JWT_AUDIENCE?.trim() || 'iprp-web',
    accessTokenTtlSeconds: positiveInteger(env, 'ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTokenTtlSeconds: positiveInteger(env, 'REFRESH_TOKEN_TTL_SECONDS', 2_592_000),
    inviteTokenTtlSeconds: positiveInteger(env, 'INVITE_TOKEN_TTL_SECONDS', 604_800),
    ...loadSupabaseConfig(env),
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
