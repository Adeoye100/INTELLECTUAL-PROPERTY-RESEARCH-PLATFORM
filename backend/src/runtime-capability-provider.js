function strictEnvBoolean(name, fallback = false) {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') return fallback;
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false.`);
  return value === 'true';
}

async function getSearchFreshness(searchService) {
  const freshnessService = searchService?.freshnessService;
  if (!freshnessService || typeof freshnessService.getSearchFreshness !== 'function') return null;
  try {
    return await freshnessService.getSearchFreshness('USPTO');
  } catch {
    return null;
  }
}

function normalizedSearchStatus(searchService, freshness) {
  if (!searchService) return 'disabled';
  if (!freshness || freshness.status === 'stale') return 'blocked';
  if (freshness.status === 'degraded' || freshness.corpusComplete === false) return 'degraded';
  return 'available';
}

/**
 * Product-state metadata derived from the runtime that is actually mounted.
 * It is intentionally conservative: uncertain capabilities are reported as
 * blocked instead of making the frontend advertise an action that may fail.
 */
export function createRuntimeCapabilityProvider({
  searchService = null,
  officeActionSearchService = null,
  watchService = null,
  exportService = null,
  userRoleService = null,
} = {}) {
  return async function runtimeCapabilities() {
    const readOnly = strictEnvBoolean('DEMO_READ_ONLY_MODE', false);
    const watchAutomationEnabled = strictEnvBoolean('WATCH_ENABLED', false);
    const officeActionCorpusReady = strictEnvBoolean('OFFICE_ACTION_CORPUS_READY', false);
    const freshness = await getSearchFreshness(searchService);
    const registrySearchStatus = normalizedSearchStatus(searchService, freshness);
    const writeStatus = readOnly ? 'blocked' : 'available';

    return {
      mode: readOnly ? 'read-only-demo' : 'standard',
      readOnly,
      registries: {
        USPTO: {
          status: registrySearchStatus,
          recordCount: Number.isFinite(Number(freshness?.recordCount)) ? Number(freshness.recordCount) : null,
          corpusComplete: freshness?.corpusComplete ?? null,
          dataThrough: freshness?.dataThrough ?? null,
        },
        EUIPO: {
          status: 'pending',
          recordCount: null,
          corpusComplete: false,
          dataThrough: null,
        },
      },
      features: {
        search: {
          status: registrySearchStatus,
          mode: freshness?.sourceMode ?? null,
        },
        riskAnalysis: {
          status: registrySearchStatus,
        },
        officeActions: {
          status: !officeActionSearchService
            ? 'disabled'
            : officeActionCorpusReady ? 'available' : 'blocked',
          reason: officeActionSearchService && !officeActionCorpusReady ? 'corpus-not-activated' : null,
        },
        portfolio: {
          status: 'available',
          writeStatus,
        },
        watches: {
          status: watchService ? 'available' : 'disabled',
          writeStatus: watchService ? writeStatus : 'disabled',
          automationStatus: watchAutomationEnabled ? 'available' : 'disabled',
        },
        reports: {
          status: !exportService ? 'disabled' : readOnly ? 'blocked' : 'available',
        },
        usersInvitations: {
          status: userRoleService ? 'available' : 'disabled',
          writeStatus: userRoleService ? writeStatus : 'disabled',
        },
      },
    };
  };
}
