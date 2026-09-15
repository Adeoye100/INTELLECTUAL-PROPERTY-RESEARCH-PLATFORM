function demoReadOnlyMode() {
  const value = process.env.DEMO_READ_ONLY_MODE?.trim() || 'false';
  if (value !== 'true' && value !== 'false') throw new Error('DEMO_READ_ONLY_MODE must be true or false.');
  return value === 'true';
}

function searchStatus(config, freshness) {
  if (!config.searchEnabled) return 'disabled';
  if (!freshness || freshness.status === 'stale') return 'blocked';
  if (freshness.status === 'degraded' || freshness.corpusComplete === false) return 'degraded';
  return 'available';
}

export function createRuntimeCapabilityProvider({ config, database, searchFreshnessService }) {
  if (!config || !database || typeof database.query !== 'function' || !searchFreshnessService
    || typeof searchFreshnessService.getSearchFreshness !== 'function') {
    throw new TypeError('Runtime capability provider needs config, database and search freshness service.');
  }

  return async function runtimeCapabilities() {
    const readOnly = demoReadOnlyMode();
    let freshness = null;
    if (config.searchEnabled) {
      try {
        freshness = await searchFreshnessService.getSearchFreshness('USPTO');
      } catch {
        freshness = null;
      }
    }

    let officeActionCorpusAvailable = false;
    if (config.officeActionSearchEnabled) {
      try {
        const result = await database.query(
          'SELECT EXISTS (SELECT 1 FROM office_action_documents LIMIT 1) AS available',
        );
        officeActionCorpusAvailable = result.rows?.[0]?.available === true;
      } catch {
        officeActionCorpusAvailable = false;
      }
    }

    const registrySearchStatus = searchStatus(config, freshness);
    const writes = readOnly ? 'blocked' : 'available';

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
          status: !config.officeActionSearchEnabled
            ? 'disabled'
            : officeActionCorpusAvailable ? 'available' : 'blocked',
          reason: config.officeActionSearchEnabled && !officeActionCorpusAvailable
            ? 'corpus-empty' : null,
        },
        portfolio: {
          status: 'available',
          writeStatus: writes,
        },
        watches: {
          status: 'available',
          writeStatus: writes,
          automationStatus: config.watchEnabled ? 'available' : 'disabled',
        },
        reports: {
          status: !config.pdfExportEnabled ? 'disabled' : readOnly ? 'blocked' : 'available',
        },
        usersInvitations: {
          status: 'available',
          writeStatus: writes,
        },
        billing: {
          status: !config.paystackEnabled ? 'disabled' : readOnly ? 'blocked' : 'available',
        },
      },
    };
  };
}
