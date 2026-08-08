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

export function loadConfig(env = process.env) {
  const jwtAccessSecret = required(env, 'JWT_ACCESS_SECRET');
  if (Buffer.byteLength(jwtAccessSecret, 'utf8') < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes.');
  }

  return {
    port: positiveInteger(env, 'PORT', 3000),
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    jwtAccessSecret,
    jwtIssuer: env.JWT_ISSUER?.trim() || 'iprp-api',
    jwtAudience: env.JWT_AUDIENCE?.trim() || 'iprp-web',
    accessTokenTtlSeconds: positiveInteger(env, 'ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTokenTtlSeconds: positiveInteger(env, 'REFRESH_TOKEN_TTL_SECONDS', 2_592_000),
    inviteTokenTtlSeconds: positiveInteger(env, 'INVITE_TOKEN_TTL_SECONDS', 604_800),
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
