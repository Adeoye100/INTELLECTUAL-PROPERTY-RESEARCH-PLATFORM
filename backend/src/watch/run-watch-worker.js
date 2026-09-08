import { createClient } from 'redis';
import { loadConfig, loadWorkerFeatureGate } from '../config.js';
import { createPool } from '../db/pool.js';
import { createSearchRuntime } from '../search/search-runtime.js';
import { RegistryRefreshRepository } from '../ingestion/registry-refresh-repository.js';
import { SearchFreshnessService } from '../search/search-freshness-service.js';
import { WatchRepository } from './watch-repository.js';
import { createWatchRuntime } from './watch-runtime.js';
import { AlertRepository } from '../alerts/alert-repository.js';
import { AlertGenerationService } from '../alerts/alert-generation-service.js';
import { createAlertMailer } from '../alerts/alert-mailer.js';
import { AlertDeliveryService } from '../alerts/alert-delivery-service.js';
import { WorkerHeartbeat } from '../operations/worker-heartbeat.js';

const enabled = loadWorkerFeatureGate(process.env, 'WATCH_ENABLED');
if (!enabled) {
  console.log('Watch worker is disabled.');
} else {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl, config);
  const redisClient = createClient({ url: config.redisUrl });
  redisClient.on('error', (error) => {
    console.error('Watch worker Redis error', { name: error.name, code: error.code ?? 'UNKNOWN' });
  });
  await redisClient.connect();

  const registryRefreshRepository = new RegistryRefreshRepository(pool);
  const searchFreshnessService = new SearchFreshnessService({
    repository: registryRefreshRepository,
    sourceRegistry: 'USPTO',
    expectedIntervalHours: config.searchRefreshExpectedIntervalHours,
    maxMissedRefreshRuns: config.searchMaxMissedRefreshRuns,
  });
  const { searchService } = createSearchRuntime(config, {
    freshnessService: searchFreshnessService,
  });
  const watchRepository = new WatchRepository(pool);
  const alertMailer = createAlertMailer(config);
  const alertDeliveryService = new AlertDeliveryService({
    database: pool,
    alertMailer,
  });
  const runtime = createWatchRuntime({
    config, redisClient, watchRepository, searchService,
    alertGenerationService: new AlertGenerationService({ repository: new AlertRepository(pool) }),
    alertDeliveryService,
  });
  runtime.worker.start();
  console.log('Watch worker started.');
  const heartbeat = new WorkerHeartbeat({
    redisClient, serviceName: 'watch', ttlSeconds: config.workerHeartbeatTtlSeconds,
  });
  await heartbeat.beat();
  const heartbeatTimer = setInterval(() => {
    heartbeat.beat().catch((error) => console.error('Watch heartbeat error', { name: error.name, code: error.code ?? 'UNKNOWN' }));
  }, Math.floor(config.workerHeartbeatTtlSeconds * 500));

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeatTimer);
    await runtime.worker.stop();
    await Promise.allSettled([redisClient.quit(), pool.end()]);
  };
  process.once('SIGINT', () => { shutdown().finally(() => process.exit(0)); });
  process.once('SIGTERM', () => { shutdown().finally(() => process.exit(0)); });
}
