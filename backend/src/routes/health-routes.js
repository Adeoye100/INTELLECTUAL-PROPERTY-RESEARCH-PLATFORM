import { Router } from 'express';

function normalizedChecks(checks) {
  if (checks === null || checks === undefined) return [];
  if (!Array.isArray(checks) || checks.some((check) => typeof check !== 'function')) {
    throw new TypeError('Health readiness checks must be an array of functions.');
  }
  return checks;
}

/** Public process and dependency probes. They intentionally disclose no host,
 * credential, version, or failing dependency details. */
export function createHealthRouter({ readinessChecks = [] } = {}) {
  const checks = normalizedChecks(readinessChecks);
  const router = Router();
  router.get('/healthz', (_request, response) => response.json({ status: 'ok' }));
  router.get('/readyz', async (_request, response) => {
    try {
      await Promise.all(checks.map((check) => check()));
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ code: 'NOT_READY', message: 'Service is not ready.' });
    }
  });
  return router;
}
