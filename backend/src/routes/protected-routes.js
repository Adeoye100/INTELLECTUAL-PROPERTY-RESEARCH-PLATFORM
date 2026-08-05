import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';

export function createProtectedRouter(authenticate) {
  const router = Router();

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

  return router;
}
