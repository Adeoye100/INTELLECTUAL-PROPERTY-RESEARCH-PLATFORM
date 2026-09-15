import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SearchFreshnessService } from '../../src/search/search-freshness-service.js';

const originalDemoMode = process.env.DEMO_READ_ONLY_MODE;
const originalFreshnessMode = process.env.SEARCH_FRESHNESS_MODE;
const originalAllowPartial = process.env.SEARCH_ALLOW_PARTIAL_CORPUS;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.DEMO_READ_ONLY_MODE;
  else process.env.DEMO_READ_ONLY_MODE = originalDemoMode;
  if (originalFreshnessMode === undefined) delete process.env.SEARCH_FRESHNESS_MODE;
  else process.env.SEARCH_FRESHNESS_MODE = originalFreshnessMode;
  if (originalAllowPartial === undefined) delete process.env.SEARCH_ALLOW_PARTIAL_CORPUS;
  else process.env.SEARCH_ALLOW_PARTIAL_CORPUS = originalAllowPartial;
});

function repository(recordCount = 2_120_000) {
  return {
    async latestRun() { return null; },
    async latestCompleteRun() { return null; },
    async latestCompleteBaselineRun() { return null; },
    async corpusSummary() {
      return {
        recordCount,
        dataThroughDate: '2026-04-02',
        indexedAt: '2026-09-15T11:00:00.000Z',
      };
    },
  };
}

describe('read-write mode with a real partial USPTO corpus', () => {
  it('keeps partial search available without forcing the application into read-only mode', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'false';
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    process.env.SEARCH_ALLOW_PARTIAL_CORPUS = 'true';

    const service = new SearchFreshnessService({ repository: repository() });
    const freshness = await service.assertSearchReady('USPTO');

    assert.equal(freshness.status, 'degraded');
    assert.equal(freshness.sourceMode, 'partial-corpus');
    assert.equal(freshness.corpusComplete, false);
    assert.equal(freshness.demoReadOnly, false);
    assert.equal(freshness.partialCorpusAllowed, true);
    assert.equal(freshness.recordCount, 2_120_000);
  });

  it('still fails closed on an empty corpus even when partial-corpus search is allowed', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'false';
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    process.env.SEARCH_ALLOW_PARTIAL_CORPUS = 'true';

    const service = new SearchFreshnessService({ repository: repository(0) });
    await assert.rejects(
      () => service.assertSearchReady('USPTO'),
      (error) => error?.code === 'SEARCH_CORPUS_UNAVAILABLE' && error?.status === 503,
    );
  });

  it('rejects invalid partial-corpus configuration', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'false';
    process.env.SEARCH_FRESHNESS_MODE = 'corpus';
    process.env.SEARCH_ALLOW_PARTIAL_CORPUS = 'yes';

    const service = new SearchFreshnessService({ repository: repository() });
    await assert.rejects(() => service.getSearchFreshness('USPTO'), /SEARCH_ALLOW_PARTIAL_CORPUS must be true or false/);
  });
});
