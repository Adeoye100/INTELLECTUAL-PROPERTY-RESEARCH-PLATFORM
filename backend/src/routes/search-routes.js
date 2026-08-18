import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { parseSearchQuery } from '../search/search-query.js';

export function createSearchRouter(authenticate, searchService) {
  const validAuthenticate = typeof authenticate === 'function'
    || (Array.isArray(authenticate) && authenticate.length > 0
      && authenticate.every((middleware) => typeof middleware === 'function'));
  if (!validAuthenticate) {
    throw new TypeError('createSearchRouter needs an authentication middleware.');
  }
  if (!searchService || typeof searchService.search !== 'function') {
    throw new TypeError('createSearchRouter needs a search service.');
  }

  const router = Router();
  router.get(
    '/search',
    authenticate,
    requireRole(['admin', 'attorney', 'viewer']),
    async (request, response) => {
      const query = parseSearchQuery(request.query);
      const federatedResponse = await searchService.search(query);
      const results = federatedResponse.results.map((hit) => ({
        id: hit.recordId,
        searchId: federatedResponse.requestId,
        candidateMarkText: hit.markText,
        candidateSource: hit.sourceRegistry,
        candidateRef: hit.sourceReferenceId,
        owner: hit.owner,
        jurisdiction: hit.jurisdiction,
        niceClasses: hit.niceClasses,
        filingDate: hit.filingDate,
        status: hit.status,
      }));

      response.json({
        results,
        sourceStatuses: federatedResponse.sourceStatuses,
        partial: federatedResponse.partial,
        requestId: federatedResponse.requestId,
      });
    },
  );
  return router;
}
