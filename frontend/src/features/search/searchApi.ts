import { getApiClient } from '../../lib/api/client';
import type { PortfolioMark, SearchResponse } from '../../types';
import { buildSearchRequestUrl, type SearchFilters } from './searchFilters';

export const searchTrademarks = (filters: SearchFilters) =>
  getApiClient().requestJson<SearchResponse>(buildSearchRequestUrl(filters));

export const getSearchResult = (resultId: string) =>
  getApiClient().requestJson<SearchResponse>(`/search?resultId=${encodeURIComponent(resultId)}`);

export const importSearchResultToPortfolio = (searchResultId: string) =>
  getApiClient().requestJson<PortfolioMark>('/portfolio/import', {
    method: 'POST',
    body: { searchResultId },
  });
