import { Router } from 'express';
import { requireFirm, requireRole } from '../auth/middleware.js';
import { createAuthIpRateLimit, resolveTrustedClientAddress } from '../auth/auth-rate-limiter.js';

export function createProtectedRouter(authenticate, {
  authRateLimiter = null,
  includeDiagnosticRoutes = false,
  capabilityProvider = null,
} = {}) {
  if (capabilityProvider !== null && typeof capabilityProvider !== 'function') {
    throw new TypeError('capabilityProvider must be a function when provided.');
  }
  const router = Router();
  const invitationIpLimit = createAuthIpRateLimit({
    limiter: authRateLimiter, policyName: 'recoveryIp', failClosed: true,
  });

  router.get('/me', authenticate, async (request, response) => {
    const { userId, email, role, firmId } = request.auth;
    const runtimeCapabilities = capabilityProvider
      ? await capabilityProvider({ userId, email, role, firmId })
      : undefined;
    response.json({
      userId,
      email,
      role: role ?? null,
      firmId: firmId ?? null,
      ...(runtimeCapabilities === undefined ? {} : { runtimeCapabilities }),
    });
  });

  if (includeDiagnosticRoutes) {
    router.get('/admin/ping', authenticate, requireRole(['admin']), (_request, response) => {
      response.json({ ok: true, minimumRole: 'admin' });
    });
    router.get(
      '/attorney/ping', authenticate, requireRole(['admin', 'attorney']),
      (_request, response) => response.json({ ok: true, minimumRole: 'attorney' }),
    );
    router.get(
      '/viewer/ping', authenticate, requireRole(['admin', 'attorney', 'viewer']),
      (_request, response) => response.json({ ok: true, minimumRole: 'viewer' }),
    );
    router.get('/firms/:firmId/ping', authenticate, requireFirm(), (_request, response) => {
      response.json({ ok: true, tenantBound: true });
    });
  }

  return router;
}
