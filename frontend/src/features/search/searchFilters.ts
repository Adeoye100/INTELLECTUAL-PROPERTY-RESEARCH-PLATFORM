import * as z from 'zod';
import type { SearchResult } from '../../types';

const optionalText = z.string().trim();

export const searchFiltersSchema = z.object({
  mark: optionalText.refine((value) => value.length === 0 || value.length >= 2, 'Enter at least 2 characters.'),
  jurisdictions: z.array(z.string()).min(1, 'Choose at least one jurisdiction.'),
  niceClass: optionalText.refine((value) => value.length === 0 || /^\d+(\s*,\s*\d+)*$/.test(value), 'Enter numeric classes separated by commas.'),
  status: z.enum(['', 'pending', 'registered', 'abandoned']),
  owner: optionalText,
  filedFrom: optionalText,
  filedTo: optionalText,
}).superRefine((filters, context) => {
  if (filters.filedFrom && filters.filedTo && filters.filedFrom > filters.filedTo) {
    context.addIssue({
      code: 'custom',
      path: ['filedTo'],
      message: 'The end date must be on or after the start date.',
    });
  }
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const defaultSearchFilters: SearchFilters = {
  mark: '',
  jurisdictions: ['US'],
  niceClass: '',
  status: '',
  owner: '',
  filedFrom: '',
  filedTo: '',
};

const filterParamNames = ['mark', 'jurisdiction', 'class', 'status', 'owner', 'filedFrom', 'filedTo'];

export const hasSearchFilterParams = (params: URLSearchParams) =>
  filterParamNames.some((name) => params.has(name));

export const normalizeSearchFilters = (filters: SearchFilters): SearchFilters => ({
  mark: filters.mark.trim(),
  jurisdictions: [...filters.jurisdictions].sort(),
  niceClass: filters.niceClass.split(',').map((value) => value.trim()).filter(Boolean).join(','),
  status: filters.status,
  owner: filters.owner.trim(),
  filedFrom: filters.filedFrom,
  filedTo: filters.filedTo,
});

export const searchFiltersToParams = (filters: SearchFilters) => {
  const normalized = normalizeSearchFilters(filters);
  const params = new URLSearchParams();
  if (normalized.mark) params.set('mark', normalized.mark);
  normalized.jurisdictions.forEach((jurisdiction) => params.append('jurisdiction', jurisdiction));
  if (normalized.niceClass) params.set('class', normalized.niceClass);
  if (normalized.status) params.set('status', normalized.status);
  if (normalized.owner) params.set('owner', normalized.owner);
  if (normalized.filedFrom) params.set('filedFrom', normalized.filedFrom);
  if (normalized.filedTo) params.set('filedTo', normalized.filedTo);
  return params;
};

export const searchFiltersFromParams = (params: URLSearchParams): SearchFilters => ({
  mark: params.get('mark') ?? '',
  jurisdictions: params.getAll('jurisdiction').length ? params.getAll('jurisdiction') : ['US'],
  niceClass: params.get('class') ?? '',
  status: (['pending', 'registered', 'abandoned'].includes(params.get('status') ?? '') ? params.get('status') : '') as SearchFilters['status'],
  owner: params.get('owner') ?? '',
  filedFrom: params.get('filedFrom') ?? '',
  filedTo: params.get('filedTo') ?? '',
});

export const buildSearchRequestUrl = (filters: SearchFilters) =>
  `/search?${searchFiltersToParams(filters).toString()}`;

const riskWeight = { high: 3, medium: 2, low: 1 } as const;

export const rankSearchResults = (results: SearchResult[]) => [...results].sort((left, right) => {
  const leftRisk = left.riskScore?.compositeRating;
  const rightRisk = right.riskScore?.compositeRating;
  const riskDifference = (rightRisk ? riskWeight[rightRisk] : 0) - (leftRisk ? riskWeight[leftRisk] : 0);
  if (riskDifference !== 0) return riskDifference;

  const leftSimilarity = left.riskScore ? Math.max(left.riskScore.phoneticScore, left.riskScore.visualScore) : 0;
  const rightSimilarity = right.riskScore ? Math.max(right.riskScore.phoneticScore, right.riskScore.visualScore) : 0;
  if (rightSimilarity !== leftSimilarity) return rightSimilarity - leftSimilarity;
  return left.candidateMarkText.localeCompare(right.candidateMarkText);
});

export const searchFilterStorageKey = (userId: string) => `forge-search-filters-v1:${userId}`;
