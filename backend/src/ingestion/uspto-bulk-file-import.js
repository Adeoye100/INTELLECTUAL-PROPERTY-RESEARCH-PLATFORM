import fs from 'node:fs';
import path from 'node:path';
import unzipper from 'unzipper';
import { parseUsptoBulkXml } from '../registries/uspto/bulk-xml-parser.js';

const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_BATCH_SIZE = 500;

function calendarDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function laterDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

async function* recordsFromZip(inputPath) {
  const archive = fs.createReadStream(inputPath).pipe(unzipper.Parse({ forceStream: true }));
  let xmlEntries = 0;
  for await (const entry of archive) {
    if (entry.type !== 'File' || !entry.path.toLowerCase().endsWith('.xml')) {
      entry.autodrain();
      continue;
    }
    xmlEntries += 1;
    yield* parseUsptoBulkXml(entry);
  }
  if (xmlEntries === 0) {
    const error = new Error('USPTO bulk ZIP contains no XML files.');
    error.code = 'USPTO_BULK_FILE_NO_XML';
    throw error;
  }
}

function recordsFromXml(inputPath) {
  return parseUsptoBulkXml(fs.createReadStream(inputPath));
}

export function validateUsptoBulkFile(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new TypeError('USPTO bulk import requires an input path.');
  }
  const absolutePath = path.resolve(inputPath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) throw new Error('USPTO bulk import input must be a file.');
  if (stat.size < 1 || stat.size > MAX_ARCHIVE_BYTES) {
    throw new Error('USPTO bulk import file size is outside the supported range.');
  }
  const extension = path.extname(absolutePath).toLowerCase();
  if (!['.xml', '.zip'].includes(extension)) {
    throw new Error('USPTO bulk import accepts only .xml or .zip files.');
  }
  return { absolutePath, extension, byteSize: stat.size };
}

/**
 * Import an already-obtained official USPTO Trademark Applications bulk file
 * into the canonical PostgreSQL corpus. This path deliberately performs no
 * USPTO network/API call and therefore needs no API key. The existing parser,
 * normalization and idempotent upsert contract remain the source of truth.
 */
export async function importUsptoBulkFile({
  inputPath,
  trademarkRepository,
  refreshRepository,
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  if (!trademarkRepository || typeof trademarkRepository.upsertBatch !== 'function') {
    throw new TypeError('USPTO bulk import requires a trademarkRepository.');
  }
  if (!refreshRepository
    || typeof refreshRepository.startRun !== 'function'
    || typeof refreshRepository.markIngested !== 'function'
    || typeof refreshRepository.markComplete !== 'function'
    || typeof refreshRepository.markFailed !== 'function') {
    throw new TypeError('USPTO bulk import requires a refreshRepository.');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new TypeError('USPTO bulk import batchSize must be an integer from 1 through 1000.');
  }

  const file = validateUsptoBulkFile(inputPath);
  const run = await refreshRepository.startRun({ sourceRegistry: 'USPTO', requestedSinceDate: null });
  let processedRecordCount = 0;
  let changedRecordCount = 0;
  let dataThroughDate = null;
  const batch = [];

  const flush = async () => {
    if (!batch.length) return;
    changedRecordCount += await trademarkRepository.upsertBatch(batch.splice(0, batch.length));
  };

  try {
    const records = file.extension === '.zip'
      ? recordsFromZip(file.absolutePath)
      : recordsFromXml(file.absolutePath);

    for await (const record of records) {
      if (record?.sourceRegistry !== 'USPTO') {
        const error = new Error('USPTO bulk parser returned a non-USPTO record.');
        error.code = 'USPTO_BULK_FILE_PROVENANCE_INVALID';
        throw error;
      }
      processedRecordCount += 1;
      dataThroughDate = laterDate(dataThroughDate, calendarDate(record.sourceUpdatedAt));
      batch.push(record);
      if (batch.length >= batchSize) await flush();
    }
    await flush();

    if (processedRecordCount === 0) {
      const error = new Error('USPTO bulk file produced no normalized trademark records.');
      error.code = 'USPTO_BULK_FILE_EMPTY';
      throw error;
    }
    if (!dataThroughDate) {
      const error = new Error('USPTO bulk file contained no valid source coverage date.');
      error.code = 'USPTO_BULK_FILE_COVERAGE_DATE_MISSING';
      throw error;
    }

    await refreshRepository.markIngested({
      runId: run.id,
      latestDiscoveredSourceDate: dataThroughDate,
      discoveredFileCount: 1,
      processedRecordCount,
      changedRecordCount,
    });
    await refreshRepository.markComplete({
      runId: run.id,
      dataThroughDate,
      projectedRecordCount: changedRecordCount,
      projectionBacklogCount: 0,
    });

    return {
      status: 'complete',
      runId: run.id,
      inputFile: path.basename(file.absolutePath),
      byteSize: file.byteSize,
      processedRecordCount,
      changedRecordCount,
      dataThroughDate,
    };
  } catch (error) {
    await refreshRepository.markFailed({
      runId: run.id,
      errorCode: typeof error?.code === 'string' ? error.code : 'USPTO_BULK_FILE_IMPORT_FAILED',
    }).catch(() => {});
    throw error;
  }
}
