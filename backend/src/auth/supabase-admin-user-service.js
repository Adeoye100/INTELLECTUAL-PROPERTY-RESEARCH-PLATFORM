const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeFailure(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function normalizedBaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError('SupabaseAdminUserService needs a valid absolute Supabase URL.');
  }

  const isLoopbackHttp = url.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLoopbackHttp) {
    throw new TypeError('Supabase Admin API must use HTTPS except during loopback testing.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError('Supabase URL must not contain credentials, a query, or a fragment.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export class SupabaseAdminUserService {
  constructor({ supabaseUrl, secretKey, fetchImplementation = globalThis.fetch }) {
    if (typeof secretKey !== 'string' || !secretKey.trim()) {
      throw new TypeError('SupabaseAdminUserService needs a Supabase secret key.');
    }
    if (typeof fetchImplementation !== 'function') {
      throw new TypeError('SupabaseAdminUserService needs a fetch implementation.');
    }

    this.supabaseUrl = normalizedBaseUrl(supabaseUrl);
    this.secretKey = secretKey.trim();
    this.fetchImplementation = fetchImplementation;
  }

  async getAuthoritativeUser(supabaseUserId) {
    if (typeof supabaseUserId !== 'string' || !UUID_PATTERN.test(supabaseUserId)) {
      throw safeFailure('SUPABASE_ADMIN_USER_ID_INVALID', 'Supabase user ID is invalid.');
    }

    let response;
    try {
      response = await this.fetchImplementation(
        `${this.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(supabaseUserId)}`,
        {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
          headers: {
            accept: 'application/json',
            apikey: this.secretKey,
            authorization: `Bearer ${this.secretKey}`,
          },
        },
      );
    } catch (error) {
      throw safeFailure(
        'SUPABASE_ADMIN_UNAVAILABLE',
        'Supabase Admin API could not verify email ownership.',
        error,
      );
    }

    if (!response?.ok) {
      throw safeFailure(
        'SUPABASE_ADMIN_REJECTED',
        'Supabase Admin API rejected the user lookup.',
      );
    }

    let user;
    try {
      user = await response.json();
    } catch (error) {
      throw safeFailure(
        'SUPABASE_ADMIN_RESPONSE_INVALID',
        'Supabase Admin API returned an invalid user record.',
        error,
      );
    }

    if (
      !user
      || typeof user !== 'object'
      || user.id !== supabaseUserId
      || typeof user.email !== 'string'
      || !user.email.trim()
    ) {
      throw safeFailure(
        'SUPABASE_ADMIN_RESPONSE_INVALID',
        'Supabase Admin API returned an invalid user record.',
      );
    }

    return {
      email: user.email,
      emailConfirmed: typeof user.email_confirmed_at === 'string'
        && user.email_confirmed_at.trim().length > 0,
    };
  }
}
