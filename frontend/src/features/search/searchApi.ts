import { getApiClient } from '../../lib/api/client';
import type { PortfolioMark, SearchResponse } from '../../types';
import { buildSearchRequestUrl, type SearchFilters } from './searchFilters';

export const searchTrademarks = (filters: SearchFilters) =>
  getApiClient().requestJson<SearchResponse>(buildSearchRequestUrl(filters));

export const getSearchResult = (resultId: string) =>
  getApiClient().requestJson<SearchResponse>(`/search-results/${encodeURIComponent(resultId)}`);

export const importSearchResultToPortfolio = (result: Partial<SearchResult>) =>
  getApiClient().requestJson<PortfolioMark>('/portfolio-marks', {
    method: 'POST',
    body: {
      markText: result.candidateMarkText ?? '',
      jurisdiction: result.jurisdiction ?? 'US',
      sourceRegistry: result.candidateSource ?? 'USPTO',
      registryReference: result.candidateRef ?? result.id ?? '',
      niceClasses: result.niceClasses ?? [],
      status: result.status ?? 'pending',
      filingDate: result.filingDate ?? null,
    },
  });
