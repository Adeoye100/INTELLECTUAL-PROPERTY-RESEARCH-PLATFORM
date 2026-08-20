import { scoreConfusionRisk } from './confusion-risk.js';
import { niceClassOverlap, normalizeMarkText } from './similarity.js';

const RATING_ORDER = Object.freeze({ high: 3, medium: 2, low: 1 });
const EVIDENCE_TYPES = Object.freeze(['Visual', 'Phonetic', 'Class']);

export class RiskEnrichmentError extends Error {
  constructor() {
    super('Risk enrichment failed.');
    this.name = 'RiskEnrichmentError';
    this.code = 'RISK_ENRICHMENT_FAILED';
  }
}

function assertQuery(query) {
  if (!query || typeof query !== 'object') {
    throw new TypeError('Risk-enriched search requires a query object.');
  }
  normalizeMarkText(query.mark);
  if (!Array.isArray(query.niceClasses)) {
    throw new TypeError('Risk-enriched search requires niceClasses to be an array.');
  }
  // Reuse the BE-10A Nice-class validation without changing the submitted array.
  niceClassOverlap(query.niceClasses, []);
}

function isScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCompleteEvidence(riskAnalysis) {
  if (!Array.isArray(riskAnalysis.matchedMarkRefs) || riskAnalysis.matchedMarkRefs.length !== 3) {
    return false;
  }
  return riskAnalysis.matchedMarkRefs.every((entry, index) => (
    entry
    && typeof entry === 'object'
    && entry.type === EVIDENCE_TYPES[index]
    && isNonEmptyString(entry.evidence)
    && isScore(entry.score)
  ));
}

function assertCompleteRiskAnalysis(riskAnalysis, candidate) {
  if (!riskAnalysis || typeof riskAnalysis !== 'object'
    || riskAnalysis.candidateRecordId !== candidate.recordId
    || riskAnalysis.candidateSource !== candidate.sourceRegistry
    || riskAnalysis.candidateRef !== candidate.sourceReferenceId
    || !isScore(riskAnalysis.phoneticScore)
    || !isScore(riskAnalysis.visualScore)
    || riskAnalysis.conceptualScore !== null
    || typeof riskAnalysis.classOverlap !== 'boolean'
    || !isScore(riskAnalysis.classOverlapScore)
    || !isScore(riskAnalysis.compositeScore)
    || !Object.hasOwn(RATING_ORDER, riskAnalysis.compositeRating)
    || !riskAnalysis.methodology
    || typeof riskAnalysis.methodology !== 'object'
    || !isNonEmptyString(riskAnalysis.methodology.version)
    || !isNonEmptyString(riskAnalysis.methodology.description)
    || !Array.isArray(riskAnalysis.methodology.sourceAttribution)
    || riskAnalysis.methodology.sourceAttribution.length === 0
    || !riskAnalysis.methodology.sourceAttribution.every(isNonEmptyString)
    || !hasCompleteEvidence(riskAnalysis)) {
    throw new RiskEnrichmentError();
  }
}

function relevanceValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/** Compare strings by Unicode code point rather than locale-dependent collation. */
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index].codePointAt(0) - rightPoints[index].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function compareResults(left, right) {
  const ratingDifference = RATING_ORDER[right.riskAnalysis.compositeRating]
    - RATING_ORDER[left.riskAnalysis.compositeRating];
  if (ratingDifference !== 0) return ratingDifference;

  const compositeDifference = right.riskAnalysis.compositeScore - left.riskAnalysis.compositeScore;
  if (compositeDifference !== 0) return compositeDifference;

  const leftRelevance = relevanceValue(left.relevanceScore);
  const rightRelevance = relevanceValue(right.relevanceScore);
  if (leftRelevance !== rightRelevance) return rightRelevance > leftRelevance ? 1 : -1;

  const registryDifference = compareCodePoints(left.sourceRegistry, right.sourceRegistry);
  if (registryDifference !== 0) return registryDifference;

  return compareCodePoints(left.sourceReferenceId, right.sourceReferenceId);
}

/**
 * Pure decorator that enriches federated-search results with complete BE-10B
 * evidence. Runtime and HTTP wiring intentionally remain deferred to BE-10C2.
 */
export class RiskEnrichedSearchService {
  constructor({ searchService, riskScorer = scoreConfusionRisk } = {}) {
    if (!searchService || typeof searchService.search !== 'function') {
      throw new TypeError('RiskEnrichedSearchService requires a searchService with a search function.');
    }
    if (typeof riskScorer !== 'function') {
      throw new TypeError('RiskEnrichedSearchService requires a riskScorer function.');
    }
    this.searchService = searchService;
    this.riskScorer = riskScorer;
  }

  async search(query) {
    assertQuery(query);
    const response = await this.searchService.search(query);
    if (!response || typeof response !== 'object' || !Array.isArray(response.results)) {
      throw new RiskEnrichmentError();
    }

    const proposedMark = {
      markText: query.mark,
      niceClasses: [...query.niceClasses],
    };
    const results = response.results.map((result) => {
      try {
        const candidate = {
          recordId: result.recordId,
          markText: result.markText,
          niceClasses: Array.isArray(result.niceClasses) ? [...result.niceClasses] : result.niceClasses,
          sourceRegistry: result.sourceRegistry,
          sourceReferenceId: result.sourceReferenceId,
        };
        const riskAnalysis = this.riskScorer({
          proposedMark: { ...proposedMark, niceClasses: [...proposedMark.niceClasses] },
          candidate,
        });
        assertCompleteRiskAnalysis(riskAnalysis, candidate);
        return { ...result, riskAnalysis };
      } catch {
        // Deliberately avoid logging candidate or query details at this boundary.
        throw new RiskEnrichmentError();
      }
    });

    results.sort(compareResults);
    return {
      results,
      sourceStatuses: response.sourceStatuses,
      partial: response.partial,
      requestId: response.requestId,
    };
  }
}
