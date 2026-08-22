import { RiskEnrichmentError } from '../risk/risk-enriched-search-service.js';

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

/** Maps only the established public contract; Elasticsearch relevance stays internal. */
export function mapRiskEnrichedSearchResponse(searchId, response) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.results)) {
    throw new RiskEnrichmentError();
  }
  return {
    searchId,
    results: response.results.map((hit) => ({
      id: hit.recordId,
      searchId,
      candidateMarkText: hit.markText,
      candidateSource: hit.sourceRegistry,
      candidateRef: hit.sourceReferenceId,
      owner: hit.owner ?? null,
      jurisdiction: hit.jurisdiction,
      niceClasses: hit.niceClasses,
      filingDate: hit.filingDate ?? null,
      status: hit.status,
      riskAnalysis: apiRiskAnalysis(hit.riskAnalysis),
    })),
    sourceStatuses: response.sourceStatuses,
    partial: response.partial,
    requestId: response.requestId,
  };
}
