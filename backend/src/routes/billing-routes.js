import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';

const unavailable = (response) => response.status(503).json({
  code: 'BILLING_UNAVAILABLE',
  message: 'Billing is not activated for this deployment.',
});

export function createBillingRouter(authenticate, billingService = null) {
  const router = Router();

  router.post('/billing/webhook', async (request, response) => {
    if (!billingService) return unavailable(response);
    await billingService.webhook({
      rawBody: request.rawBody,
      signature: request.get('x-paystack-signature'),
      event: request.body,
    });
    return response.status(200).json({ received: true });
  });

  router.use('/billing', authenticate, requireRole(['admin']));

  router.get('/billing', async (request, response) => {
    if (!billingService) {
      return response.json({
        enabled: false,
        subscription: null,
        transactions: [],
        plans: [],
      });
    }
    return response.json({ enabled: true, ...(await billingService.summary(request.auth)) });
  });

  router.post('/billing/checkout', async (request, response) => {
    if (!billingService) return unavailable(response);
    return response.status(201).json(await billingService.initialize(request.auth, request.body, request.auditContext));
  });

  router.post('/billing/verify', async (request, response) => {
    if (!billingService) return unavailable(response);
    return response.json(await billingService.verify(request.auth, request.body, request.auditContext));
  });

  return router;
}
