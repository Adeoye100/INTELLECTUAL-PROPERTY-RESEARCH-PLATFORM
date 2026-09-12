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
  // Keep logs actionable without allowing upstream response bodies, headers,
  // credentials, or unbounded content into production logs.
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

/**
 * Lightweight production maintenance host for deployments where Search and
 * Watch share the API's existing database/Redis credentials. It is explicitly
 * feature-gated and uses the same advisory lock as the standalone ingestion
 * command, so a later dedicated cron can be introduced without double-imports.
 */
export function startLiveMaintenance({ config, system }) {
  const refreshEnabled = enabled('USPTO_REFRESH_IN_PROCESS_ENABLED', false);
  const watchEnabled = enabled('WATCH_IN_PROCESS_ENABLED', false) && config.watchEnabled === true;
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

  const startWatch = () => {
    if (!watchEnabled || stopped || watchStarted || !system.watchRuntime?.worker) return;
    system.watchRuntime.worker.start();
    watchStarted = true;
    console.log('In-process watch worker started after Search freshness activation.');
  };

  const refresh = async () => {
    if (!refreshEnabled || stopped || refreshRunning) return null;
    refreshRunning = executeUsptoSearchRefresh({
      pool: system.pool,
      config: ingestionConfig(config),
    });
    try {
      const result = await refreshRunning;
      // Do not dequeue due watches against an empty/stale initial corpus. A
      // completed refresh makes the freshness ledger authoritative and allows
      // the existing Watch processor to use the same live Search source.
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

  if (!refreshEnabled) {
    // Deployments using an external ingestion schedule may start Watch
    // immediately; its processor still enforces the persisted freshness gate.
    startWatch();
  } else {
    // Start after the HTTP server has had time to become healthy. The database
    // advisory lock prevents overlap with a standalone/manual refresh.
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
      if (watchStarted && system.watchRuntime?.worker) await system.watchRuntime.worker.stop();
      await refreshRunning;
    },
  };
}
