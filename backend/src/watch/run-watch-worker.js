import { createClient } from 'redis';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { createSearchRuntime } from '../search/search-runtime.js';
import { WatchRepository } from './watch-repository.js';
import { createWatchRuntime } from './watch-runtime.js';
import { AlertRepository } from '../alerts/alert-repository.js';
import { AlertGenerationService } from '../alerts/alert-generation-service.js';
import { WorkerHeartbeat } from '../operations/worker-heartbeat.js';

const config = loadConfig();
if (!config.watchEnabled) {
  console.log('Watch worker is disabled.');
} else {
  const pool = createPool(config.databaseUrl, config.databaseSsl);
  const redisClient = createClient({ url: config.redisUrl });
  redisClient.on('error', (error) => {
    console.error('Watch worker Redis error', { name: error.name, code: error.code ?? 'UNKNOWN' });
  });
  await redisClient.connect();
  const { searchService } = createSearchRuntime(config);
  const watchRepository = new WatchRepository(pool);
  const runtime = createWatchRuntime({
    config, redisClient, watchRepository, searchService,
    alertGenerationService: new AlertGenerationService({ repository: new AlertRepository(pool) }),
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
