import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { AppError } from '../errors.js';
import { RiskEnrichmentError } from '../risk/risk-enriched-search-service.js';
import { mapRiskEnrichedSearchResponse } from '../search/search-result-mapper.js';
import { parseSearchQuery } from '../search/search-query.js';

function demoReadOnlyMode() {
  const value = process.env.DEMO_READ_ONLY_MODE?.trim() || 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error('DEMO_READ_ONLY_MODE must be true or false.');
  }
  return value === 'true';
}

export function createSearchRouter(authenticate, searchService, { searchResultService } = {}) {
  const validAuthenticate = typeof authenticate === 'function'
    || (Array.isArray(authenticate) && authenticate.length > 0
      && authenticate.every((middleware) => typeof middleware === 'function'));
  if (!validAuthenticate) {
    throw new TypeError('createSearchRouter needs an authentication middleware.');
  }
  if (!searchService || typeof searchService.search !== 'function') {
    throw new TypeError('createSearchRouter needs a search service.');
  }
  if (!searchResultService || typeof searchResultService.persistSearch !== 'function') {
    throw new TypeError('createSearchRouter needs a search result service.');
  }

  const router = Router();
  router.get(
    '/search',
    authenticate,
    requireRole(['admin', 'attorney', 'viewer']),
    async (request, response, next) => {
      try {
        const query = parseSearchQuery(request.query);
        const federatedResponse = await searchService.search(query, {
          requestId: request.auditContext?.requestId ?? null,
        });

        if (demoReadOnlyMode()) {
          const mapped = mapRiskEnrichedSearchResponse(randomUUID(), federatedResponse);
          response.json({
            ...mapped,
            dataFreshness: federatedResponse?.dataFreshness ?? null,
            demoReadOnly: true,
          });
          return;
        }

        const persisted = await searchResultService.persistSearch({
          firmId: request.auth.firmId,
          requestedByUserId: request.auth.userId,
          query,
          searchResponse: federatedResponse,
          requestContext: request.auditContext,
        });
        response.json(persisted.response);
      } catch (error) {
        if (error instanceof RiskEnrichmentError) {
          return next(new AppError(
            500,
            'RISK_ENRICHMENT_FAILED',
            'Risk evidence could not be calculated.',
          ));
        }
        return next(error);
      }
    },
  );
  return router;
}
