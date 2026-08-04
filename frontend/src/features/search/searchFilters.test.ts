import { describe, expect, it } from 'vitest';
import { mockSearchResponse } from '../../lib/mocks/handlers';
import { buildSearchRequestUrl, rankSearchResults, searchFiltersSchema } from './searchFilters';

describe('search filter contract', () => {
  it('serializes all effective filters into the request URL', () => {
    const url = new URL(buildSearchRequestUrl({
      mark: ' FORGE ', jurisdictions: ['US', 'EU'], niceClass: '9, 35', status: 'registered',
      owner: ' Forge Holdings ', filedFrom: '2023-01-01', filedTo: '2025-12-31',
    }), 'https://example.test');

    expect(url.searchParams.get('mark')).toBe('FORGE');
    expect(url.searchParams.getAll('jurisdiction')).toEqual(['EU', 'US']);
    expect(url.searchParams.get('class')).toBe('9,35');
    expect(url.searchParams.get('status')).toBe('registered');
    expect(url.searchParams.get('owner')).toBe('Forge Holdings');
    expect(url.searchParams.get('filedFrom')).toBe('2023-01-01');
    expect(url.searchParams.get('filedTo')).toBe('2025-12-31');
  });

  it('validates the filing-date range', () => {
    const result = searchFiltersSchema.safeParse({
      mark: '', jurisdictions: ['US'], niceClass: '', status: '', owner: '',
      filedFrom: '2025-12-31', filedTo: '2025-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('ranks explicit risk before similarity without mutating arrival order', () => {
    const arrivalOrder = [...mockSearchResponse.results].reverse();
    expect(rankSearchResults(arrivalOrder).map(({ riskScore }) => riskScore?.compositeRating)).toEqual([
      'high', 'medium', 'low',
    ]);
    expect(arrivalOrder[0].riskScore?.compositeRating).toBe('low');
  });
});
