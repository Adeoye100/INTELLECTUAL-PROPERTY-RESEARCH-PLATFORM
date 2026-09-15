import { Router } from 'express';

/** Authenticated deployment-capability surface used by the frontend to avoid
 * presenting write actions or data-dependent features that the current runtime
 * cannot actually serve. It intentionally exposes only product-state metadata. */
export function createCapabilityRouter(authenticate, capabilityProvider) {
  if ((typeof authenticate !== 'function' && !Array.isArray(authenticate)) || typeof capabilityProvider !== 'function') {
    throw new TypeError('createCapabilityRouter needs authentication middleware and a capability provider.');
  }

  const router = Router();
  router.get('/capabilities', authenticate, async (request, response) => {
    response.json(await capabilityProvider({
      role: request.auth?.role ?? null,
      firmId: request.auth?.firmId ?? null,
      userId: request.auth?.userId ?? null,
    }));
  });
  return router;
}
