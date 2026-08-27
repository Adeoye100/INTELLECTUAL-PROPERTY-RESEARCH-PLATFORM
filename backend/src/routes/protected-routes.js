import { Router } from 'express';
import { requireFirm, requireRole } from '../auth/middleware.js';
import { createAuthIpRateLimit, resolveTrustedClientAddress } from '../auth/auth-rate-limiter.js';
import { validateInvitationIssue } from '../auth/auth-route-validation.js';

export function createProtectedRouter(authenticate, authService, {
  authRateLimiter = null,
  includeDiagnosticRoutes = false,
} = {}) {
  const router = Router();
  const invitationIpLimit = createAuthIpRateLimit({
    limiter: authRateLimiter, policyName: 'recoveryIp', failClosed: true,
  });

  router.get('/me', authenticate, (request, response) => {
    const { userId, email, role, firmId } = request.auth;
    response.json({
      userId,
      email,
      role: role ?? null,
      firmId: firmId ?? null,
    });
  });

  router.post(
    '/admin/invitations',
    resolveTrustedClientAddress,
    invitationIpLimit,
    validateInvitationIssue,
    authenticate,
    requireRole(['admin']),
    async (request, response) => {
      response.status(201).json(await authService.issueInvitation(request.auth, request.body));
    },
  );

  if (includeDiagnosticRoutes) {
    router.get('/admin/ping', authenticate, requireRole(['admin']), (_request, response) => {
      response.json({ ok: true, minimumRole: 'admin' });
    });
    router.get(
      '/attorney/ping',
      authenticate,
      requireRole(['admin', 'attorney']),
      (_request, response) => response.json({ ok: true, minimumRole: 'attorney' }),
    );
    router.get(
      '/viewer/ping',
      authenticate,
      requireRole(['admin', 'attorney', 'viewer']),
      (_request, response) => response.json({ ok: true, minimumRole: 'viewer' }),
    );
    router.get('/firms/:firmId/ping', authenticate, requireFirm(), (_request, response) => {
      response.json({ ok: true, tenantBound: true });
    });
  }

  return router;
}
