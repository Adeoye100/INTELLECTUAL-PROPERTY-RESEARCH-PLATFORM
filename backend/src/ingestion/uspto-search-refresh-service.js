import { UsptoBulkXmlAdapter } from '../registries/uspto/bulk-xml-adapter.js';
import { UsptoOdpBulkXmlAdapter } from '../registries/uspto/odp-bulk-adapter.js';
import { ingestRegistryRecords } from './ingest-registry.js';
import { RegistryTrademarkRepository } from './registry-trademark-repository.js';
import { RegistryRefreshRepository } from './registry-refresh-repository.js';
import {
  ElasticsearchProjector,
  syncRegistryTrademarksToElasticsearch,
} from './elasticsearch-projector.js';

const LOCK_KEY = 'uspto_search_refresh';

function classifyError(error) {
  if (!error) return 'UNKNOWN_REFRESH_ERROR';
  const message = error.message ?? '';
  const name = error.name ?? '';

  if (message.includes('BASELINE_REQUIRED')) return 'BASELINE_REQUIRED';
  if (message.includes('PROJECTION_BACKLOG_REMAINS')) return 'PROJECTION_BACKLOG_REMAINS';
  if (name === 'RegistryHttpError' && (message.includes('manifest') || message.includes('discovery'))) return 'BULK_DISCOVERY_FAILED';
  if (name === 'RegistryHttpError' || message.includes('download') || message.includes('redirect')) return 'BULK_DOWNLOAD_FAILED';
  if (name === 'RegistryResponseSizeError' || message.includes('ZIP') || message.includes('XML') || message.includes('parse')) return 'BULK_PARSE_FAILED';
  if (message.includes('Elasticsearch') || message.includes('projection')) return 'ELASTICSEARCH_PROJECTION_FAILED';
  if (message.includes('INSERT') || message.includes('UPDATE') || message.includes('database') || message.includes('PostgreSQL')) return 'DATABASE_IMPORT_FAILED';
  return 'UNKNOWN_REFRESH_ERROR';
}

function createConfiguredAdapter(config) {
  if (config.usptoBulkSource === 'odp') {
    return new UsptoOdpBulkXmlAdapter({
      apiKey: config.usptoOdpApiKey,
      baseUrl: config.usptoOdpApiBaseUrl,
      annualProduct: config.usptoOdpAnnualProduct,
      dailyProduct: config.usptoOdpDailyProduct,
    });
  }
  return new UsptoBulkXmlAdapter({ listingUrl: config.usptoBulkListingUrl });
}

function calendarDate(value, message) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(message);
  return date;
}

export async function executeUsptoSearchRefresh({
  pool,
  config,
  sinceOverride = null,
  adapterOverride = null,
  projectorOverride = null,
}) {
  const lockResult = await pool.query(
    'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
    [LOCK_KEY],
  );
  const locked = Boolean(lockResult.rows[0]?.locked);
  if (!locked) {
    console.log('USPTO search refresh skipped; run is already in progress', { code: 'REFRESH_ALREADY_RUNNING' });
    return { status: 'already_running' };
  }

  const refreshRepo = new RegistryRefreshRepository(pool);
  const trademarkRepo = new RegistryTrademarkRepository(pool);
  let runId = null;

  try {
    const latestComplete = await refreshRepo.latestCompleteRun('USPTO');
    const adapter = adapterOverride ?? createConfiguredAdapter(config);
    let requestedSinceDate;
    let updates;
    let baseline = false;

    if (sinceOverride) {
      const since = calendarDate(sinceOverride, 'Explicit since date is invalid.');
      requestedSinceDate = since.toISOString().slice(0, 10);
      updates = await adapter.discoverUpdates(since);
    } else if (latestComplete) {
      const baseDateStr = latestComplete.dataThroughDate || latestComplete.requestedSinceDate;
      if (!baseDateStr) {
        throw new Error('BASELINE_REQUIRED: Previous complete run contained no dataThroughDate or requestedSinceDate.');
      }
      const since = calendarDate(baseDateStr, 'Previous complete refresh date is invalid.');
      since.setUTCDate(since.getUTCDate() - (config.usptoIngestionOverlapDays ?? 3));
      requestedSinceDate = since.toISOString().slice(0, 10);
      updates = await adapter.discoverUpdates(since);
    } else if (typeof adapter.discoverBaselineUpdates === 'function') {
      const discovery = await adapter.discoverBaselineUpdates();
      if (!discovery?.coverageStart || !Array.isArray(discovery.updates) || discovery.updates.length === 0) {
        throw new Error('BASELINE_REQUIRED: USPTO ODP did not return a usable annual baseline.');
      }
      baseline = true;
      requestedSinceDate = discovery.coverageStart.toISOString().slice(0, 10);
      updates = discovery.updates;
    } else {
      throw new Error(
        'BASELINE_REQUIRED: Configure the official USPTO ODP source for automatic annual baseline loading, or provide an explicit --since date.',
      );
    }

    const run = await refreshRepo.startRun({
      sourceRegistry: 'USPTO',
      requestedSinceDate,
    });
    runId = run.id;

    const discoveredFileCount = updates.length;
    const latestDiscoveredSourceDate = updates.length
      ? updates[updates.length - 1].date.toISOString().slice(0, 10)
      : null;

    let processedRecordCount = 0;
    let changedRecordCount = 0;
    let lastProcessedFileDate = null;

    for (const update of updates) {
      const result = await ingestRegistryRecords({
        records: adapter.fetchUpdate(update),
        repository: trademarkRepo,
        batchSize: 500,
      });
      processedRecordCount += result.processed;
      changedRecordCount += result.changed;
      lastProcessedFileDate = update.date.toISOString().slice(0, 10);
      console.log('USPTO bulk file ingested', {
        kind: update.kind ?? 'daily',
        file: update.fileName ?? null,
        sourceDate: lastProcessedFileDate,
        processed: result.processed,
        changed: result.changed,
      });
    }

    const dataThroughDate = lastProcessedFileDate ?? (latestComplete ? latestComplete.dataThroughDate : null);
    if (!dataThroughDate) throw new Error('BASELINE_REQUIRED: Refresh produced no source coverage date.');

    await refreshRepo.markIngested({
      runId: run.id,
      latestDiscoveredSourceDate,
      discoveredFileCount,
      processedRecordCount,
      changedRecordCount,
    });

    const projector = projectorOverride ?? new ElasticsearchProjector({
      baseUrl: config.elasticsearchUrl,
      indexName: config.elasticsearchIndex,
    });

    const syncResult = await syncRegistryTrademarksToElasticsearch({
      repository: trademarkRepo,
      projector,
    });

    const backlogCount = await trademarkRepo.projectionBacklogCount();
    if (backlogCount > 0) throw new Error(`PROJECTION_BACKLOG_REMAINS: ${backlogCount} unprojected row(s) remain.`);

    const completedRun = await refreshRepo.markComplete({
      runId: run.id,
      dataThroughDate,
      projectedRecordCount: syncResult.projected,
      projectionBacklogCount: backlogCount,
    });

    console.log('USPTO search refresh complete', {
      runId: run.id,
      mode: baseline ? 'annual-baseline-plus-daily' : 'incremental-daily',
      since: requestedSinceDate,
      filesDiscovered: discoveredFileCount,
      processed: processedRecordCount,
      changed: changedRecordCount,
      projected: syncResult.projected,
      dataThrough: dataThroughDate,
    });

    return { status: 'complete', run: completedRun, baseline };
  } catch (error) {
    const errorCode = classifyError(error);
    if (runId) await refreshRepo.markFailed({ runId, errorCode }).catch(() => {});
    console.error('USPTO search refresh failed', { runId, code: errorCode });
    throw error;
  } finally {
    await pool.query(
      'SELECT pg_advisory_unlock(hashtext($1))',
      [LOCK_KEY],
    ).catch(() => {});
  }
}
