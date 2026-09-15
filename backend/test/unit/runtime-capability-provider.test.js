import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createRuntimeCapabilityProvider } from '../../src/runtime-capability-provider.js';

const originalDemoMode = process.env.DEMO_READ_ONLY_MODE;
const originalWatchEnabled = process.env.WATCH_ENABLED;
const originalOfficeActionReady = process.env.OFFICE_ACTION_CORPUS_READY;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.DEMO_READ_ONLY_MODE;
  else process.env.DEMO_READ_ONLY_MODE = originalDemoMode;
  if (originalWatchEnabled === undefined) delete process.env.WATCH_ENABLED;
  else process.env.WATCH_ENABLED = originalWatchEnabled;
  if (originalOfficeActionReady === undefined) delete process.env.OFFICE_ACTION_CORPUS_READY;
  else process.env.OFFICE_ACTION_CORPUS_READY = originalOfficeActionReady;
});

function searchService(freshness) {
  return {
    freshnessService: {
      async getSearchFreshness(source) {
        assert.equal(source, 'USPTO');
        return freshness;
      },
    },
  };
}

describe('runtime capability provider', () => {
  it('reports partial USPTO search as degraded and blocks writes in read-only demo mode', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'true';
    process.env.WATCH_ENABLED = 'false';
    delete process.env.OFFICE_ACTION_CORPUS_READY;

    const provider = createRuntimeCapabilityProvider({
      searchService: searchService({
        status: 'degraded', sourceMode: 'partial-demo-corpus', recordCount: 2_123_375,
        corpusComplete: false, dataThrough: '2026-04-02',
      }),
      officeActionSearchService: { searchOfficeActions() {} },
      watchService: {},
      exportService: {},
      billingService: null,
      userRoleService: {},
    });

    const capabilities = await provider();
    assert.equal(capabilities.mode, 'read-only-demo');
    assert.equal(capabilities.readOnly, true);
    assert.equal(capabilities.registries.USPTO.status, 'degraded');
    assert.equal(capabilities.registries.USPTO.recordCount, 2_123_375);
    assert.equal(capabilities.registries.USPTO.corpusComplete, false);
    assert.equal(capabilities.registries.EUIPO.status, 'pending');
    assert.equal(capabilities.features.watches.writeStatus, 'blocked');
    assert.equal(capabilities.features.watches.automationStatus, 'disabled');
    assert.equal(capabilities.features.officeActions.status, 'blocked');
    assert.equal(capabilities.features.reports.status, 'blocked');
    assert.equal(capabilities.features.billing.status, 'disabled');
  });

  it('reports mounted standard services as available only when their activation evidence is explicit', async () => {
    process.env.DEMO_READ_ONLY_MODE = 'false';
    process.env.WATCH_ENABLED = 'true';
    process.env.OFFICE_ACTION_CORPUS_READY = 'true';

    const provider = createRuntimeCapabilityProvider({
      searchService: searchService({
        status: 'ready', sourceMode: 'persisted-bulk-corpus', recordCount: 10,
        corpusComplete: true, dataThrough: '2026-09-15',
      }),
      officeActionSearchService: { searchOfficeActions() {} },
      watchService: {},
      exportService: {},
      billingService: {},
      userRoleService: {},
    });

    const capabilities = await provider();
    assert.equal(capabilities.mode, 'standard');
    assert.equal(capabilities.features.search.status, 'available');
    assert.equal(capabilities.features.officeActions.status, 'available');
    assert.equal(capabilities.features.watches.writeStatus, 'available');
    assert.equal(capabilities.features.watches.automationStatus, 'available');
    assert.equal(capabilities.features.reports.status, 'available');
    assert.equal(capabilities.features.billing.status, 'available');
  });
});
