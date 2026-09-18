import { executeUsptoSearchRefresh } from '../ingestion/uspto-search-refresh-service.js';
import { loadUsptoBulkSourceConfig } from '../registries/uspto/odp-config.js';

function enabled(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw !== 'true' && raw !== 'false') throw new Error(`${name} must be true or false.`);
  return raw === 'true';
}

function boundedInterval(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim() || String(fallback);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function safeDiagnosticMessage(error) {
  const value = typeof error?.message === 'string' ? error.message : '';
  return value
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240) || 'No diagnostic message available.';
}

function ingestionConfig(config) {
  return {
    ...config,
    ...loadUsptoBulkSourceConfig(process.env),
    usptoBulkListingUrl: process.env.USPTO_BULK_LISTING_URL?.trim() || undefined,
    usptoIngestionOverlapDays: boundedInterval('USPTO_INGESTION_OVERLAP_DAYS', 3, 1, 30),
  };
}

function diagnosticDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const normalized = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/.exec(normalized);
  return match ? match[1] : null;
}

async function logPersistedCorpusReadiness(system) {
  if (!system?.pool || typeof system.pool.query !== 'function') return;
  try {
    const [registry, officeActions] = await Promise.all([
      system.pool.query(
        `SELECT COUNT(*)::bigint AS count, MAX(source_updated_at) AS data_through
         FROM registry_trademarks WHERE source_registry = $1`,
        ['USPTO'],
      ),
      system.pool.query(
        `SELECT COUNT(*)::bigint AS count, MAX(office_action_date) AS data_through
         FROM office_action_documents WHERE source_registry = $1`,
        ['USPTO'],
      ),
    ]);
    const registryRow = registry.rows?.[0] ?? {};
    const officeActionRow = officeActions.rows?.[0] ?? {};
    console.log('Persisted USPTO corpus readiness', {
      trademarkRecordCount: Number(registryRow.count ?? 0),
      trademarkDataThrough: diagnosticDateOnly(registryRow.data_through),
      officeActionRecordCount: Number(officeActionRow.count ?? 0),
      officeActionDataThrough: diagnosticDateOnly(officeActionRow.data_through),
    });
  } catch (error) {
    console.warn('Persisted USPTO corpus readiness check failed', {
      name: error?.name ?? 'Error',
      code: error?.code ?? 'CORPUS_READINESS_CHECK_FAILED',
    });
  }
}

/**
 * Lightweight production maintenance host. Search can operate entirely from
 * the persisted Supabase/PostgreSQL corpus while optional upstream ingestion
 * remains disabled. Watch and PDF workers may run in-process against the same
 * Redis/database credentials, avoiding browser-side report generation.
 */
export function startLiveMaintenance({ config, system }) {
  const refreshEnabled = enabled('USPTO_REFRESH_IN_PROCESS_ENABLED', false);
  const watchEnabled = enabled('WATCH_IN_PROCESS_ENABLED', false) && config.watchEnabled === true;
  const pdfEnabled = enabled('PDF_EXPORT_IN_PROCESS_ENABLED', false) && config.pdfExportEnabled === true;
  const intervalMs = boundedInterval(
    'USPTO_REFRESH_INTERVAL_MS',
    6 * 60 * 60 * 1000,
    15 * 60 * 1000,
    24 * 60 * 60 * 1000,
  );

  let stopped = false;
  let initialTimer = null;
  let refreshTimer = null;
  let refreshRunning = null;
  let watchStarted = false;
  let pdfStarted = false;

  const startWatch = () => {
    if (!watchEnabled || stopped || watchStarted || !system.watchRuntime?.worker) return;
    system.watchRuntime.worker.start();
    watchStarted = true;
    console.log('In-process watch worker started after Search freshness activation.');
  };

  const startPdf = () => {
    if (!pdfEnabled || stopped || pdfStarted || !system.pdfExportRuntime?.worker) return;
    system.pdfExportRuntime.worker.start();
    pdfStarted = true;
    console.log('In-process PDF export worker started.');
  };

  const refresh = async () => {
    if (!refreshEnabled || stopped || refreshRunning) return null;
    refreshRunning = executeUsptoSearchRefresh({
      pool: system.pool,
      config: ingestionConfig(config),
    });
    try {
      const result = await refreshRunning;
      if (result?.status === 'complete') startWatch();
      return result;
    } catch (error) {
      console.error('Scheduled USPTO refresh failed', {
        name: error?.name ?? 'Error',
        code: error?.code ?? 'USPTO_REFRESH_FAILED',
        message: safeDiagnosticMessage(error),
        causeCode: typeof error?.cause?.code === 'string' ? error.cause.code.slice(0, 80) : null,
      });
      return null;
    } finally {
      refreshRunning = null;
    }
  };

  void logPersistedCorpusReadiness(system);
  startPdf();

  if (!refreshEnabled) {
    startWatch();
  } else {
    initialTimer = setTimeout(() => { refresh().catch(() => {}); }, 5_000);
    initialTimer.unref?.();
    refreshTimer = setInterval(() => { refresh().catch(() => {}); }, intervalMs);
    refreshTimer.unref?.();
    console.log('In-process USPTO refresh scheduler started', { intervalMs });
  }

  return {
    async stop() {
      stopped = true;
      if (initialTimer) clearTimeout(initialTimer);
      initialTimer = null;
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      const stops = [];
      if (watchStarted && system.watchRuntime?.worker) stops.push(system.watchRuntime.worker.stop());
      if (pdfStarted && system.pdfExportRuntime?.worker) stops.push(system.pdfExportRuntime.worker.stop());
      await Promise.allSettled(stops);
      await refreshRunning;
    },
  };
}
