import { createHash, randomUUID } from 'node:crypto';
import { EXPORT_UUID_PATTERN } from './export-validation.js';

export const PDF_EXPORT_QUEUE = 'queue:pdf_export';
export const MAX_PDF_EXPORT_QUEUE_JOB_BYTES = 1024;
export class PdfExportQueueError extends Error {
  constructor(code = 'EXPORT_QUEUE_UNAVAILABLE') { super('PDF export queue is unavailable.'); this.code = code; }
}
function validIso(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }
export function deterministicPdfExportJobId(exportId, scheduledFor, attempt) {
  if (!EXPORT_UUID_PATTERN.test(exportId ?? '') || !validIso(scheduledFor) || !Number.isSafeInteger(attempt) || attempt < 0 || attempt > 10) {
    throw new PdfExportQueueError('EXPORT_JOB_INVALID');
  }
  return `pdf-export-${createHash('sha256').update(`${exportId}:${scheduledFor}:${attempt}`).digest('hex').slice(0, 32)}`;
}
export function validatePdfExportJob(job, maxAttempts = 3) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new PdfExportQueueError('EXPORT_JOB_INVALID');
  const allowed = new Set(['version', 'jobId', 'exportId', 'firmId', 'scheduledFor', 'attempt']);
  if (Object.keys(job).some((key) => !allowed.has(key)) || job.version !== 1
    || !EXPORT_UUID_PATTERN.test(job.exportId ?? '') || !EXPORT_UUID_PATTERN.test(job.firmId ?? '')
    || !validIso(job.scheduledFor) || !Number.isSafeInteger(job.attempt) || job.attempt < 0 || job.attempt >= maxAttempts
    || job.jobId !== deterministicPdfExportJobId(job.exportId, job.scheduledFor, job.attempt)) {
    throw new PdfExportQueueError('EXPORT_JOB_INVALID');
  }
  return { version: 1, jobId: job.jobId, exportId: job.exportId, firmId: job.firmId, scheduledFor: job.scheduledFor, attempt: job.attempt };
}
const RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const DEQUEUE = "local item=redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1], 'LIMIT', 0, 1)[1]; if item then redis.call('ZREM', KEYS[2], item); return item end; return redis.call('RPOP', KEYS[1])";

export class RedisPdfExportQueue {
  constructor({ redisClient, queueKey = PDF_EXPORT_QUEUE, maxAttempts = 3, dedupeTtlSeconds = 172_800, lockTtlMs = 300_000 }) {
    if (!redisClient || ['set', 'lPush', 'zAdd', 'del', 'eval'].some((method) => typeof redisClient[method] !== 'function')) {
      throw new TypeError('RedisPdfExportQueue needs a Redis client.');
    }
    if (typeof queueKey !== 'string' || !/^queue:[a-z0-9:_-]{1,100}$/.test(queueKey) || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      throw new TypeError('RedisPdfExportQueue needs valid queue configuration.');
    }
    if (!Number.isSafeInteger(dedupeTtlSeconds) || dedupeTtlSeconds < 60 || dedupeTtlSeconds > 604_800
      || !Number.isSafeInteger(lockTtlMs) || lockTtlMs < 1_000 || lockTtlMs > 3_600_000) {
      throw new TypeError('RedisPdfExportQueue needs bounded TTL configuration.');
    }
    this.redisClient = redisClient; this.queueKey = queueKey; this.maxAttempts = maxAttempts;
    this.dedupeTtlSeconds = dedupeTtlSeconds; this.lockTtlMs = lockTtlMs;
  }
  dedupeKey(jobId) { return `pdf-export:dedupe:${jobId}`; }
  lockKey(jobId) { return `pdf-export:lock:${jobId}`; }
  scheduledKey() { return `${this.queueKey}:scheduled`; }
  async enqueue(job) {
    const valid = validatePdfExportJob(job, this.maxAttempts);
    try {
      const claimed = await this.redisClient.set(this.dedupeKey(valid.jobId), '1', { NX: true, EX: this.dedupeTtlSeconds });
      if (claimed !== 'OK') return { enqueued: false, deduplicated: true, jobId: valid.jobId };
      try {
        const serialized = JSON.stringify(valid);
        if (Date.parse(valid.scheduledFor) > Date.now()) {
          await this.redisClient.zAdd(this.scheduledKey(), [{ score: Date.parse(valid.scheduledFor), value: serialized }]);
        } else await this.redisClient.lPush(this.queueKey, serialized);
      } catch (error) {
        await this.redisClient.del(this.dedupeKey(valid.jobId)).catch(() => {}); throw error;
      }
      return { enqueued: true, deduplicated: false, jobId: valid.jobId };
    } catch (error) { if (error instanceof PdfExportQueueError) throw error; throw new PdfExportQueueError(); }
  }
  async dequeue() {
    let raw;
    try { raw = await this.redisClient.eval(DEQUEUE, { keys: [this.queueKey, this.scheduledKey()], arguments: [String(Date.now())] }); } catch { throw new PdfExportQueueError(); }
    if (raw === null) return null;
    try {
      if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_PDF_EXPORT_QUEUE_JOB_BYTES) {
        throw new Error('oversized');
      }
      return validatePdfExportJob(JSON.parse(raw), this.maxAttempts);
    } catch { throw new PdfExportQueueError('EXPORT_JOB_INVALID'); }
  }
  async acquireProcessingLock(jobId) {
    try { const token = randomUUID(); const value = await this.redisClient.set(this.lockKey(jobId), token, { NX: true, PX: this.lockTtlMs }); return value === 'OK' ? token : null; } catch { throw new PdfExportQueueError(); }
  }
  async releaseProcessingLock(jobId, token) {
    try { await this.redisClient.eval(RELEASE, { keys: [this.lockKey(jobId)], arguments: [token] }); } catch { throw new PdfExportQueueError(); }
  }
}
