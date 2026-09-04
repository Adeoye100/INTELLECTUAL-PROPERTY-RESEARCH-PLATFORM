import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';

export function createBillingRouter(authenticate, billingService) {
  const router = Router();
  router.post('/billing/webhook', async (request, response) => {
    await billingService.webhook({
      rawBody: request.rawBody,
      signature: request.get('x-paystack-signature'),
      event: request.body,
    });
    response.status(200).json({ received: true });
  });
  router.use('/billing', authenticate, requireRole(['admin']));
  router.get('/billing', async (request, response) => response.json(await billingService.summary(request.auth)));
  router.post('/billing/checkout', async (request, response) => {
    response.status(201).json(await billingService.initialize(request.auth, request.body, request.auditContext));
  });
  router.post('/billing/verify', async (request, response) => {
    response.json(await billingService.verify(request.auth, request.body, request.auditContext));
  });
  return router;
}
