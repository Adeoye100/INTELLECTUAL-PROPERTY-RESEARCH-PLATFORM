import { Router } from 'express';

export function createProvisioningRouter(authenticateIdentity, provisioningService) {
  const router = Router();

  router.post('/firm', authenticateIdentity, async (request, response) => {
    const result = await provisioningService.provisionFirm(request.auth, request.body);
    response.status(201).json(result);
  });

  return router;
}
