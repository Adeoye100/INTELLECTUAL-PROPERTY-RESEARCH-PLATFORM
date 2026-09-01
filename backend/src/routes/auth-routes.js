import { Router } from 'express';
import { createAuthIpRateLimit, resolveTrustedClientAddress } from '../auth/auth-rate-limiter.js';

export function createAuthRouter(invitationService, authenticateIdentity, { authRateLimiter = null } = {}) {
  const router = Router();
  const validationIpLimit = createAuthIpRateLimit({ limiter: authRateLimiter, policyName: 'recoveryIp', failClosed: true });
  const redemptionIpLimit = createAuthIpRateLimit({ limiter: authRateLimiter, policyName: 'recoveryIp', failClosed: true });

  router.get('/invitations/:token', resolveTrustedClientAddress, validationIpLimit, async (request, response) => {
    response.json(await invitationService.invitationDetails(request.params.token));
  });
  router.post('/invitations/:token/redeem', resolveTrustedClientAddress, redemptionIpLimit, authenticateIdentity, async (request, response) => {
    response.status(201).json(await invitationService.redeem(request.params.token, request.auth, request.auditContext));
  });
  return router;
}
