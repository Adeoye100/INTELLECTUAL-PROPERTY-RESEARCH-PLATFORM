import { forbidden, unauthorized } from '../errors.js';

export function createSupabaseAuthenticate(verifier, logger = console) {
  if (!verifier || typeof verifier.verifyAccessToken !== 'function') {
    throw new TypeError('createSupabaseAuthenticate needs a Supabase token verifier.');
  }

  return async function authenticateWithSupabase(request, _response, next) {
    const authorization = request.get('authorization');
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) return next(unauthorized());

    try {
      const identity = await verifier.verifyAccessToken(match[1]);
      request.user = identity;
      request.auth = identity;
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

export function createResolveRoleAndFirm(roleFirmResolver) {
  if (!roleFirmResolver || typeof roleFirmResolver.resolveRoleAndFirm !== 'function') {
    throw new TypeError('createResolveRoleAndFirm needs a role/firm resolver.');
  }

  return async function resolveVerifiedMembership(request, _response, next) {
    if (!request.user) return next(unauthorized());

    if (request.user.supabaseRole !== 'authenticated') {
      const unauthorizedUser = {
        ...request.user,
        role: undefined,
        firmId: undefined,
      };
      request.user = unauthorizedUser;
      request.auth = unauthorizedUser;
      return next();
    }

    try {
      const membership = await roleFirmResolver.resolveRoleAndFirm(
        request.user.userId,
        request.user.email,
      );
      const authorizedUser = {
        ...request.user,
        role: membership?.role,
        firmId: membership?.firmId,
      };
      request.user = authorizedUser;
      request.auth = authorizedUser;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireFirm(parameterName = 'firmId') {
  return function enforceFirm(request, _response, next) {
    if (!request.auth) return next(unauthorized());
    if (
      typeof request.auth.firmId !== 'string'
      || request.params?.[parameterName] !== request.auth.firmId
    ) {
      return next(forbidden());
    }
    return next();
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
