import { createClient } from 'redis';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { createSearchRuntime } from '../search/search-runtime.js';
import { WatchRepository } from './watch-repository.js';
import { createWatchRuntime } from './watch-runtime.js';

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
  const runtime = createWatchRuntime({
    config, redisClient, watchRepository: new WatchRepository(pool), searchService,
  });
  runtime.worker.start();
  console.log('Watch worker started.');

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await runtime.worker.stop();
    await Promise.allSettled([redisClient.quit(), pool.end()]);
  };
  process.once('SIGINT', () => { shutdown().finally(() => process.exit(0)); });
  process.once('SIGTERM', () => { shutdown().finally(() => process.exit(0)); });
}
