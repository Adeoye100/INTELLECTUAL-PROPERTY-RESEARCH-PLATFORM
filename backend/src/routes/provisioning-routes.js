import { Router } from 'express';
import { createAuthIpRateLimit, resolveTrustedClientAddress } from '../auth/auth-rate-limiter.js';
import { validateFirmProvisioning } from '../auth/auth-route-validation.js';

export function createProvisioningRouter(authenticateIdentity, provisioningService, { authRateLimiter = null } = {}) {
  const router = Router();
  const registrationIpLimit = createAuthIpRateLimit({
    limiter: authRateLimiter, policyName: 'recoveryIp', failClosed: true,
  });

  router.post('/firm', resolveTrustedClientAddress, registrationIpLimit, validateFirmProvisioning, authenticateIdentity, async (request, response) => {
    const result = await provisioningService.provisionFirm(request.auth, request.body);
    response.status(201).json(result);
  });

  return router;
}
