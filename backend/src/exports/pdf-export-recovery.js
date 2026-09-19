import { deterministicPdfExportJobId } from './pdf-export-queue.js';

const DEFAULT_MINIMUM_AGE_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 100;

function isoNow(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('PDF export recovery clock returned an invalid time.');
  return date;
}

export async function recoverQueuedPdfExports({
  repository,
  queue,
  clock = () => new Date(),
  minimumAgeMs = DEFAULT_MINIMUM_AGE_MS,
  limit = DEFAULT_LIMIT,
} = {}) {
  if (!repository || typeof repository.listQueuedBefore !== 'function'
    || !queue || typeof queue.enqueue !== 'function') {
    throw new TypeError('PDF export recovery requires a repository and queue.');
  }
  if (!Number.isSafeInteger(minimumAgeMs) || minimumAgeMs < 60_000 || minimumAgeMs > 24 * 60 * 60 * 1000
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new TypeError('PDF export recovery requires bounded recovery configuration.');
  }

  const current = isoNow(clock);
  const cutoff = new Date(current.getTime() - minimumAgeMs).toISOString();
  const records = await repository.listQueuedBefore({ before: cutoff, limit });
  let enqueued = 0;
  let deduplicated = 0;

  for (const record of records) {
    const scheduledFor = new Date(record.queuedAt).toISOString();
    const job = {
      version: 1,
      exportId: record.id,
      firmId: record.firmId,
      scheduledFor,
      attempt: 0,
      jobId: deterministicPdfExportJobId(record.id, scheduledFor, 0),
    };
    const result = await queue.enqueue(job);
    if (result?.enqueued === true) enqueued += 1;
    else if (result?.deduplicated === true) deduplicated += 1;
  }

  return { scanned: records.length, enqueued, deduplicated, cutoff };
}
