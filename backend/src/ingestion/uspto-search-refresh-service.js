import { UsptoBulkXmlAdapter } from '../registries/uspto/bulk-xml-adapter.js';
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
  if (name === 'RegistryHttpError' && message.includes('discovery')) return 'BULK_DISCOVERY_FAILED';
  if (name === 'RegistryHttpError' || message.includes('download')) return 'BULK_DOWNLOAD_FAILED';
  if (name === 'RegistryResponseSizeError' || message.includes('ZIP') || message.includes('XML') || message.includes('parse')) return 'BULK_PARSE_FAILED';
  if (message.includes('Elasticsearch') || message.includes('projection')) return 'ELASTICSEARCH_PROJECTION_FAILED';
  if (message.includes('INSERT') || message.includes('UPDATE') || message.includes('database') || message.includes('PostgreSQL')) return 'DATABASE_IMPORT_FAILED';
  return 'UNKNOWN_REFRESH_ERROR';
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
    console.log('USPTO search refresh skipped; run is already in progress', {
      code: 'REFRESH_ALREADY_RUNNING',
    });
    return { status: 'already_running' };
  }

  const refreshRepo = new RegistryRefreshRepository(pool);
  const trademarkRepo = new RegistryTrademarkRepository(pool);
  let runId = null;

  try {
    const latestComplete = await refreshRepo.latestCompleteRun('USPTO');

    let since;
    if (sinceOverride) {
      since = new Date(`${sinceOverride}T00:00:00.000Z`);
      if (Number.isNaN(since.getTime())) {
        throw new Error('Explicit since date is invalid.');
      }
    } else if (latestComplete) {
      const baseDateStr = latestComplete.dataThroughDate || latestComplete.requestedSinceDate;
      if (!baseDateStr) {
        throw new Error('BASELINE_REQUIRED: Previous complete run contained no dataThroughDate or requestedSinceDate.');
      }
      const baseDate = new Date(`${baseDateStr}T00:00:00.000Z`);
      baseDate.setUTCDate(baseDate.getUTCDate() - (config.usptoIngestionOverlapDays ?? 3));
      since = baseDate;
    } else {
      throw new Error(
        'BASELINE_REQUIRED: An explicit baseline source date is required before automatic incremental refresh can begin.',
      );
    }

    const requestedSinceStr = since.toISOString().slice(0, 10);
    const run = await refreshRepo.startRun({
      sourceRegistry: 'USPTO',
      requestedSinceDate: requestedSinceStr,
    });
    runId = run.id;

    const adapter = adapterOverride ?? new UsptoBulkXmlAdapter({
      listingUrl: config.usptoBulkListingUrl,
    });

    const updates = await adapter.discoverUpdates(since);
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
    }

    const dataThroughDate = lastProcessedFileDate ?? (latestComplete ? latestComplete.dataThroughDate : null);

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
    if (backlogCount > 0) {
      throw new Error(`PROJECTION_BACKLOG_REMAINS: ${backlogCount} unprojected row(s) remain.`);
    }

    const completedRun = await refreshRepo.markComplete({
      runId: run.id,
      dataThroughDate,
      projectedRecordCount: syncResult.projected,
      projectionBacklogCount: backlogCount,
    });

    console.log('USPTO search refresh complete', {
      runId: run.id,
      since: requestedSinceStr,
      filesDiscovered: discoveredFileCount,
      processed: processedRecordCount,
      changed: changedRecordCount,
      projected: syncResult.projected,
      dataThrough: dataThroughDate,
    });

    return { status: 'complete', run: completedRun };
  } catch (error) {
    const errorCode = classifyError(error);
    if (runId) {
      await refreshRepo.markFailed({ runId, errorCode }).catch(() => {});
    }
    console.error('USPTO search refresh failed', {
      runId,
      code: errorCode,
    });
    throw error;
  } finally {
    await pool.query(
      'SELECT pg_advisory_unlock(hashtext($1))',
      [LOCK_KEY],
    ).catch(() => {});
  }
}
