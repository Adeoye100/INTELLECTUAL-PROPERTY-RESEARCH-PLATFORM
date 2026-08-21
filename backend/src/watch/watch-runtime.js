import { RedisWatchIngestQueue } from './watch-ingest-queue.js';
import { WatchIngestProcessor } from './watch-ingest-processor.js';
import { WatchScheduler } from './watch-scheduler.js';
import { WatchWorker } from './watch-worker.js';

export function createWatchRuntime({ config, redisClient, watchRepository, searchService, alertGenerationService, clock } = {}) {
  if (!config?.watchEnabled) return null;
  const queue = new RedisWatchIngestQueue({ redisClient });
  const scheduler = new WatchScheduler({
    repository: watchRepository, queue, clock, batchSize: config.watchSchedulerBatchSize,
  });
  const processor = new WatchIngestProcessor({
    repository: watchRepository, queue, searchService, alertGenerationService, clock,
  });
  const worker = new WatchWorker({
    scheduler, queue, processor, intervalMs: config.watchSchedulerIntervalMs,
    maxJobsPerTick: config.watchSchedulerBatchSize,
  });
  return { queue, scheduler, processor, worker };
}
