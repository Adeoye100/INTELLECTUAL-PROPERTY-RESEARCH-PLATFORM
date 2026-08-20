import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { AppError } from '../errors.js';
import { RiskEnrichmentError } from '../risk/risk-enriched-search-service.js';
import { parseSearchQuery } from '../search/search-query.js';

function apiRiskAnalysis(riskAnalysis) {
  if (!riskAnalysis || typeof riskAnalysis !== 'object') throw new RiskEnrichmentError();
  return {
    candidateRecordId: riskAnalysis.candidateRecordId,
    candidateSource: riskAnalysis.candidateSource,
    candidateRef: riskAnalysis.candidateRef,
    phoneticScore: riskAnalysis.phoneticScore,
    visualScore: riskAnalysis.visualScore,
    conceptualScore: riskAnalysis.conceptualScore,
    classOverlap: riskAnalysis.classOverlap,
    classOverlapScore: riskAnalysis.classOverlapScore,
    compositeScore: riskAnalysis.compositeScore,
    compositeRating: riskAnalysis.compositeRating,
    methodology: riskAnalysis.methodology,
    matchedMarkRefs: riskAnalysis.matchedMarkRefs,
  };
}

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
    async (request, response, next) => {
      try {
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
          riskAnalysis: apiRiskAnalysis(hit.riskAnalysis),
        }));

        response.json({
          results,
          sourceStatuses: federatedResponse.sourceStatuses,
          partial: federatedResponse.partial,
          requestId: federatedResponse.requestId,
        });
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
