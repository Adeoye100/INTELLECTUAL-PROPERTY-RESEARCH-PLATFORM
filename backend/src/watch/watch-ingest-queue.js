import { createHash, randomUUID } from 'node:crypto';
import { UUID_PATTERN } from './watch-validation.js';

export const WATCH_INGEST_QUEUE = 'queue:watch_ingest';
const DEDUPE_TTL_SECONDS = 172_800;
const LOCK_TTL_MS = 300_000;
export const WATCH_MAX_ATTEMPTS = 3;
export const MAX_WATCH_QUEUE_JOB_BYTES = 1024;

export class WatchQueueError extends Error {
  constructor(code = 'WATCH_QUEUE_UNAVAILABLE') {
    super('Watch queue is unavailable.');
    this.name = 'WatchQueueError';
    this.code = code;
  }
}

function validIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function deterministicWatchJobId(watchId, scheduledFor) {
  if (typeof watchId !== 'string' || !UUID_PATTERN.test(watchId) || !validIso(scheduledFor)) {
    throw new WatchQueueError('WATCH_JOB_INVALID');
  }
  return `watch-ingest-${createHash('sha256').update(`${watchId}:${scheduledFor}`).digest('hex').slice(0, 32)}`;
}

export function validateWatchJob(job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new WatchQueueError('WATCH_JOB_INVALID');
  const allowed = new Set(['version', 'jobId', 'watchId', 'firmId', 'portfolioMarkId', 'scheduledFor', 'attempt']);
  if (Object.keys(job).some((key) => !allowed.has(key))
    || job.version !== 1
    || !UUID_PATTERN.test(job.watchId ?? '')
    || !UUID_PATTERN.test(job.firmId ?? '')
    || !UUID_PATTERN.test(job.portfolioMarkId ?? '')
    || !validIso(job.scheduledFor)
    || !Number.isSafeInteger(job.attempt) || job.attempt < 0 || job.attempt >= WATCH_MAX_ATTEMPTS
    || job.jobId !== deterministicWatchJobId(job.watchId, job.scheduledFor)) {
    throw new WatchQueueError('WATCH_JOB_INVALID');
  }
  return {
    version: 1, jobId: job.jobId, watchId: job.watchId, firmId: job.firmId,
    portfolioMarkId: job.portfolioMarkId, scheduledFor: job.scheduledFor, attempt: job.attempt,
  };
}

const releaseScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

export class RedisWatchIngestQueue {
  constructor({ redisClient, dedupeTtlSeconds = DEDUPE_TTL_SECONDS, lockTtlMs = LOCK_TTL_MS }) {
    if (!redisClient || typeof redisClient.set !== 'function' || typeof redisClient.lPush !== 'function'
      || typeof redisClient.rPop !== 'function' || typeof redisClient.del !== 'function'
      || typeof redisClient.eval !== 'function') {
      throw new TypeError('RedisWatchIngestQueue needs a Redis client.');
    }
    if (!Number.isSafeInteger(dedupeTtlSeconds) || dedupeTtlSeconds < 60 || dedupeTtlSeconds > 604_800
      || !Number.isSafeInteger(lockTtlMs) || lockTtlMs < 1_000 || lockTtlMs > 3_600_000) {
      throw new TypeError('RedisWatchIngestQueue needs bounded TTL configuration.');
    }
    this.redisClient = redisClient;
    this.dedupeTtlSeconds = dedupeTtlSeconds;
    this.lockTtlMs = lockTtlMs;
  }

  dedupeKey(jobId) { return `watch-ingest:dedupe:${jobId}`; }
  lockKey(jobId) { return `watch-ingest:lock:${jobId}`; }

  async enqueue(job) {
    const valid = validateWatchJob(job);
    try {
      const claimed = await this.redisClient.set(this.dedupeKey(valid.jobId), '1', {
        NX: true, EX: this.dedupeTtlSeconds,
      });
      if (claimed !== 'OK') return { enqueued: false, deduplicated: true, jobId: valid.jobId };
      try {
        await this.redisClient.lPush(WATCH_INGEST_QUEUE, JSON.stringify(valid));
      } catch (error) {
        await this.redisClient.del(this.dedupeKey(valid.jobId)).catch(() => {});
        throw error;
      }
      return { enqueued: true, deduplicated: false, jobId: valid.jobId };
    } catch (error) {
      if (error instanceof WatchQueueError) throw error;
      throw new WatchQueueError();
    }
  }

  async dequeue() {
    let serialized;
    try { serialized = await this.redisClient.rPop(WATCH_INGEST_QUEUE); } catch { throw new WatchQueueError(); }
    if (serialized === null) return null;
    try {
      if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_WATCH_QUEUE_JOB_BYTES) {
        throw new Error('oversized');
      }
      return validateWatchJob(JSON.parse(serialized));
    } catch { throw new WatchQueueError('WATCH_JOB_INVALID'); }
  }

  async acquireProcessingLock(jobId) {
    try {
      const token = randomUUID();
      const acquired = await this.redisClient.set(this.lockKey(jobId), token, { NX: true, PX: this.lockTtlMs });
      return acquired === 'OK' ? token : null;
    } catch { throw new WatchQueueError(); }
  }

  async releaseProcessingLock(jobId, token) {
    try {
      await this.redisClient.eval(releaseScript, { keys: [this.lockKey(jobId)], arguments: [token] });
    } catch { throw new WatchQueueError(); }
  }
}
