import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

const ASYMMETRIC_ALGORITHMS = new Set(['ES256', 'RS256']);
const VERIFICATION_MODES = new Set(['jwks', 'auth-server']);
const AUTHENTICATED_AUDIENCE = 'authenticated';

export class SupabaseVerificationError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'SupabaseVerificationError';
    this.code = code;
  }
}

function failure(code, message, cause) {
  return new SupabaseVerificationError(code, message, cause ? { cause } : undefined);
}

function normalizeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError('supabaseUrl must be a valid absolute URL.');
  }

  const isLoopbackHttp = url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLoopbackHttp) {
    throw new TypeError('supabaseUrl must use HTTPS (HTTP is allowed only for loopback testing).');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError('supabaseUrl must not contain credentials, a query, or a fragment.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function normalizeAlgorithms(algorithms, verificationMode) {
  if (verificationMode !== 'jwks') return [];
  if (!Array.isArray(algorithms) || algorithms.length === 0) {
    throw new TypeError('algorithms must contain at least one asymmetric JWT algorithm.');
  }
  if (algorithms.some((algorithm) => !ASYMMETRIC_ALGORITHMS.has(algorithm))) {
    throw new TypeError('algorithms may contain only ES256 and/or RS256.');
  }
  return [...new Set(algorithms)];
}

function joseFailure(error) {
  if (error?.code === 'ERR_JWT_EXPIRED') {
    return failure('SUPABASE_TOKEN_EXPIRED', 'Supabase access token is expired.', error);
  }
  if (error?.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
    return failure(
      'SUPABASE_TOKEN_SIGNATURE_INVALID',
      'Supabase access-token signature is invalid.',
      error,
    );
  }
  if (error?.code === 'ERR_JOSE_ALG_NOT_ALLOWED') {
    return failure(
      'SUPABASE_TOKEN_ALGORITHM_NOT_ALLOWED',
      'Supabase access-token algorithm is not allowed.',
      error,
    );
  }
  if (error?.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && error.claim === 'iss') {
    return failure('SUPABASE_TOKEN_ISSUER_INVALID', 'Supabase access-token issuer is invalid.', error);
  }
  if (error?.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && error.claim === 'aud') {
    return failure(
      'SUPABASE_TOKEN_AUDIENCE_INVALID',
      'Supabase access-token audience is invalid.',
      error,
    );
  }
  if (['ERR_JWT_INVALID', 'ERR_JWS_INVALID'].includes(error?.code)) {
    return failure('SUPABASE_TOKEN_MALFORMED', 'Supabase access token is malformed.', error);
  }
  if (error instanceof SupabaseVerificationError) return error;
  return failure(
    'SUPABASE_TOKEN_UNVERIFIABLE',
    'Supabase access token could not be verified.',
    error,
  );
}

function hasAudience(payload, audience) {
  return payload.aud === audience
    || (Array.isArray(payload.aud) && payload.aud.includes(audience));
}

function validatePayload(payload, issuer, now = Date.now()) {
  if (payload.iss !== issuer) {
    throw failure('SUPABASE_TOKEN_ISSUER_INVALID', 'Supabase access-token issuer is invalid.');
  }
  if (!hasAudience(payload, AUTHENTICATED_AUDIENCE)) {
    throw failure(
      'SUPABASE_TOKEN_AUDIENCE_INVALID',
      'Supabase access-token audience is invalid.',
    );
  }
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(now / 1_000)) {
    throw failure('SUPABASE_TOKEN_EXPIRED', 'Supabase access token is expired.');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw failure('SUPABASE_TOKEN_SUBJECT_INVALID', 'Supabase access-token subject is invalid.');
  }
  if (payload.email != null && typeof payload.email !== 'string') {
    throw failure('SUPABASE_TOKEN_CLAIMS_INVALID', 'Supabase access-token claims are invalid.');
  }
  if (payload.role != null && typeof payload.role !== 'string') {
    throw failure('SUPABASE_TOKEN_CLAIMS_INVALID', 'Supabase access-token claims are invalid.');
  }
  if (payload.session_id != null && typeof payload.session_id !== 'string') {
    throw failure('SUPABASE_TOKEN_CLAIMS_INVALID', 'Supabase access-token claims are invalid.');
  }
}

function normalizedIdentity(payload) {
  return {
    userId: payload.sub,
    email: payload.email ?? null,
    supabaseRole: payload.role,
    sessionId: payload.session_id ?? null,
    claims: payload,
  };
}

export class SupabaseVerifier {
  constructor({
    supabaseUrl,
    publishableKey,
    verificationMode,
    algorithms = [],
    fetchImplementation = globalThis.fetch,
  }) {
    if (!VERIFICATION_MODES.has(verificationMode)) {
      throw new TypeError('verificationMode must be either jwks or auth-server.');
    }

    this.supabaseUrl = normalizeUrl(supabaseUrl);
    this.issuer = `${this.supabaseUrl}/auth/v1`;
    this.verificationMode = verificationMode;
    this.algorithms = normalizeAlgorithms(algorithms, verificationMode);
    this.publishableKey = publishableKey?.trim();
    this.fetchImplementation = fetchImplementation;

    if (verificationMode === 'auth-server') {
      if (!this.publishableKey) {
        throw new TypeError('publishableKey is required in auth-server mode.');
      }
      if (typeof fetchImplementation !== 'function') {
        throw new TypeError('A fetch implementation is required in auth-server mode.');
      }
    } else {
      this.jwks = createRemoteJWKSet(
        new URL(`${this.issuer}/.well-known/jwks.json`),
        {
          cacheMaxAge: 600_000,
          cooldownDuration: 30_000,
          timeoutDuration: 5_000,
        },
      );
    }
  }

  async verifyAccessToken(token) {
    if (typeof token !== 'string' || token.length === 0) {
      throw failure('SUPABASE_TOKEN_MALFORMED', 'Supabase access token is malformed.');
    }
    if (this.verificationMode === 'jwks') return this.verifyWithJwks(token);
    return this.verifyWithAuthServer(token);
  }

  async verifyWithJwks(token) {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        algorithms: this.algorithms,
        issuer: this.issuer,
        audience: AUTHENTICATED_AUDIENCE,
      });
      validatePayload(payload, this.issuer);
      return normalizedIdentity(payload);
    } catch (error) {
      throw joseFailure(error);
    }
  }

  async verifyWithAuthServer(token) {
    let response;
    try {
      response = await this.fetchImplementation(`${this.issuer}/user`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
        headers: {
          accept: 'application/json',
          apikey: this.publishableKey,
          authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      throw failure(
        'SUPABASE_AUTH_SERVER_UNAVAILABLE',
        'Supabase Auth server could not verify the access token.',
        error,
      );
    }

    if (!response?.ok) {
      throw failure(
        'SUPABASE_AUTH_SERVER_REJECTED',
        'Supabase Auth server rejected the access token.',
      );
    }

    let user;
    try {
      user = await response.json();
    } catch (error) {
      throw failure(
        'SUPABASE_AUTH_SERVER_RESPONSE_INVALID',
        'Supabase Auth server returned an invalid response.',
        error,
      );
    }
    if (!user || typeof user !== 'object' || typeof user.id !== 'string' || !user.id) {
      throw failure(
        'SUPABASE_AUTH_SERVER_RESPONSE_INVALID',
        'Supabase Auth server returned an invalid response.',
      );
    }

    let payload;
    try {
      payload = decodeJwt(token);
      validatePayload(payload, this.issuer);
    } catch (error) {
      throw joseFailure(error);
    }
    if (payload.sub !== user.id) {
      throw failure(
        'SUPABASE_AUTH_SERVER_RESPONSE_INVALID',
        'Supabase Auth server returned a mismatched user identity.',
      );
    }
    return normalizedIdentity(payload);
  }
}
