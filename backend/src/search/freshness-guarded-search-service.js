export class FreshnessGuardedSearchService {
  constructor({
    searchService,
    freshnessService,
  }) {
    if (!searchService || typeof searchService.search !== 'function') {
      throw new TypeError('FreshnessGuardedSearchService needs an inner searchService.');
    }
    if (!freshnessService || typeof freshnessService.assertSearchReady !== 'function') {
      throw new TypeError('FreshnessGuardedSearchService needs a freshnessService.');
    }
    this.searchService = searchService;
    this.freshnessService = freshnessService;
  }

  async search(query, context) {
    const freshness = await this.freshnessService.assertSearchReady();
    const result = await this.searchService.search(query, context);
    return {
      ...result,
      dataFreshness: freshness,
    };
  }
}
