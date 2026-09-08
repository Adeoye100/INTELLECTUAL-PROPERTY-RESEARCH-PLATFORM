import { getApiClient } from '../../lib/api/client';
import type { PersistedSearchResult, SearchResponse } from '../../types';
import { buildSearchRequestUrl, type SearchFilters } from './searchFilters';

export const searchTrademarks = (filters: SearchFilters) =>
  getApiClient().requestJson<SearchResponse>(buildSearchRequestUrl(filters));

export const getSearchResult = (searchId: string) =>
  getApiClient().requestJson<PersistedSearchResult>(`/search-results/${encodeURIComponent(searchId)}`);

