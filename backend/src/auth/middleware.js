import { forbidden, unauthorized } from '../errors.js';

export function createAuthenticate(tokenService) {
  return async function authenticate(request, _response, next) {
    const authorization = request.get('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) return next(unauthorized());

    try {
      request.auth = await tokenService.verifyAccessToken(match[1]);
      return next();
    } catch {
      return next(unauthorized('Access token is invalid or expired.'));
    }
  };
}

export function createSupabaseAuthenticate(verifier, logger = console) {
  if (!verifier || typeof verifier.verifyAccessToken !== 'function') {
    throw new TypeError('createSupabaseAuthenticate needs a Supabase token verifier.');
  }

  return async function authenticateWithSupabase(request, _response, next) {
    const authorization = request.get('authorization');
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) return next(unauthorized());

    try {
      request.auth = await verifier.verifyAccessToken(match[1]);
      return next();
    } catch (error) {
      logger.warn('Supabase authentication failed', {
        name: error?.name ?? 'Error',
        code: error?.code ?? 'SUPABASE_TOKEN_UNVERIFIABLE',
      });
      return next(unauthorized('Access token is invalid or expired.'));
    }
  };
}

export function requireRole(allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new TypeError('requireRole needs at least one allowed role.');
  }
  const allowed = new Set(allowedRoles);

  return function enforceRole(request, _response, next) {
    if (!request.auth) return next(unauthorized());
    if (!allowed.has(request.auth.role)) return next(forbidden());
    return next();
  };
}
