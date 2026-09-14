import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import unzipper from 'unzipper';
import { parseUsptoBulkXml } from '../registries/uspto/bulk-xml-parser.js';

const MAX_INPUT_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_UNCOMPRESSED_XML_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_XML_ENTRIES_PER_ARCHIVE = 4;
const DEFAULT_BATCH_SIZE = 500;
const ANNUAL_PART_PATTERN = /^apc(\d{8})-(\d{8})-(\d{2,3})\.(zip|xml)$/i;

function calendarDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function compactDateToIso(value) {
  if (!/^\d{8}$/.test(value ?? '')) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function laterDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function limitedReadable(readable, maxBytes = MAX_UNCOMPRESSED_XML_BYTES) {
  let seen = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      seen += chunk.length;
      if (seen > maxBytes) {
        const error = new Error('USPTO bulk XML entry exceeds the supported uncompressed size limit.');
        error.code = 'USPTO_BULK_FILE_XML_TOO_LARGE';
        callback(error);
        return;
      }
      callback(null, chunk);
    },
  });
  return readable.pipe(limiter);
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
    if (xmlEntries > MAX_XML_ENTRIES_PER_ARCHIVE) {
      entry.autodrain();
      const error = new Error('USPTO bulk ZIP contains too many XML entries.');
      error.code = 'USPTO_BULK_FILE_XML_ENTRY_LIMIT';
      throw error;
    }
    yield* parseUsptoBulkXml(limitedReadable(entry));
  }
  if (xmlEntries === 0) {
    const error = new Error('USPTO bulk ZIP contains no XML files.');
    error.code = 'USPTO_BULK_FILE_NO_XML';
    throw error;
  }
}

function recordsFromXml(inputPath) {
  return parseUsptoBulkXml(limitedReadable(fs.createReadStream(inputPath)));
}

function recordsFromFile(file) {
  return file.extension === '.zip'
    ? recordsFromZip(file.absolutePath)
    : recordsFromXml(file.absolutePath);
}

export function annualPartInfo(inputPath) {
  const match = path.basename(inputPath).match(ANNUAL_PART_PATTERN);
  if (!match) return null;
  const [, startCompact, endCompact, partText] = match;
  const startDate = compactDateToIso(startCompact);
  const endDate = compactDateToIso(endCompact);
  const partNumber = Number(partText);
  if (!startDate || !endDate || !Number.isSafeInteger(partNumber) || partNumber < 1) return null;
  return {
    sourceRelease: `apc${startCompact}-${endCompact}`,
    startDate,
    endDate,
    partNumber,
  };
}

export function validateUsptoBulkFile(inputPath) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new TypeError('USPTO bulk import requires an input path.');
  }
  const absolutePath = path.resolve(inputPath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) throw new Error('USPTO bulk import input must be a file.');
  if (stat.size < 1 || stat.size > MAX_INPUT_BYTES) {
    throw new Error('USPTO bulk import file size is outside the supported range.');
  }
  const extension = path.extname(absolutePath).toLowerCase();
  if (!['.xml', '.zip'].includes(extension)) {
    throw new Error('USPTO bulk import accepts only .xml or .zip files.');
  }
  return {
    absolutePath,
    extension,
    byteSize: stat.size,
    annualPart: annualPartInfo(absolutePath),
  };
}

export function validateAnnualPartSet(inputPaths, expectedPartCount) {
  if (!Array.isArray(inputPaths) || inputPaths.length === 0) {
    throw new TypeError('USPTO annual baseline import requires one or more input paths.');
  }
  if (!Number.isSafeInteger(expectedPartCount) || expectedPartCount < 1 || expectedPartCount > 999) {
    throw new TypeError('expectedPartCount must be an integer from 1 through 999.');
  }

  const files = inputPaths.map(validateUsptoBulkFile);
  if (files.some((file) => !file.annualPart)) {
    const error = new Error('Every annual baseline input must use the official apcSTART-END-PART.zip/xml naming pattern.');
    error.code = 'USPTO_ANNUAL_PART_NAME_INVALID';
    throw error;
  }

  const releases = new Set(files.map((file) => file.annualPart.sourceRelease));
  if (releases.size !== 1) {
    const error = new Error('Annual baseline inputs must all belong to the same USPTO release.');
    error.code = 'USPTO_ANNUAL_RELEASE_MISMATCH';
    throw error;
  }

  const byPart = new Map();
  for (const file of files) {
    const part = file.annualPart.partNumber;
    if (byPart.has(part)) {
      const error = new Error(`Annual baseline contains duplicate part ${part}.`);
      error.code = 'USPTO_ANNUAL_DUPLICATE_PART';
      throw error;
    }
    byPart.set(part, file);
  }

  const missing = [];
  for (let part = 1; part <= expectedPartCount; part += 1) {
    if (!byPart.has(part)) missing.push(part);
  }
  const unexpected = [...byPart.keys()].filter((part) => part > expectedPartCount).sort((a, b) => a - b);
  if (missing.length || unexpected.length || files.length !== expectedPartCount) {
    const error = new Error(
      `Annual baseline set is incomplete: expected parts 1-${expectedPartCount}; missing ${missing.join(', ') || 'none'}; unexpected ${unexpected.join(', ') || 'none'}.`,
    );
    error.code = 'USPTO_ANNUAL_PART_SET_INCOMPLETE';
    throw error;
  }

  const ordered = [...files].sort((left, right) => left.annualPart.partNumber - right.annualPart.partNumber);
  const first = ordered[0].annualPart;
  return {
    files: ordered,
    sourceRelease: first.sourceRelease,
    requestedSinceDate: first.startDate,
    nominalCoverageEndDate: first.endDate,
    expectedPartCount,
    totalCompressedBytes: ordered.reduce((sum, file) => sum + file.byteSize, 0),
  };
}

async function ingestFiles({
  files,
  run,
  trademarkRepository,
  refreshRepository,
  batchSize,
}) {
  let processedRecordCount = 0;
  let changedRecordCount = 0;
  let dataThroughDate = null;
  const batch = [];

  const flush = async () => {
    if (!batch.length) return;
    changedRecordCount += await trademarkRepository.upsertBatch(batch.splice(0, batch.length));
  };

  try {
    for (const file of files) {
      for await (const record of recordsFromFile(file)) {
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
    }

    if (processedRecordCount === 0) {
      const error = new Error('USPTO bulk file set produced no normalized trademark records.');
      error.code = 'USPTO_BULK_FILE_EMPTY';
      throw error;
    }
    if (!dataThroughDate) {
      const error = new Error('USPTO bulk file set contained no valid source coverage date.');
      error.code = 'USPTO_BULK_FILE_COVERAGE_DATE_MISSING';
      throw error;
    }

    await refreshRepository.markIngested({
      runId: run.id,
      latestDiscoveredSourceDate: dataThroughDate,
      discoveredFileCount: files.length,
      processedRecordCount,
      changedRecordCount,
    });
    await refreshRepository.markComplete({
      runId: run.id,
      dataThroughDate,
      projectedRecordCount: changedRecordCount,
      projectionBacklogCount: 0,
    });

    return { processedRecordCount, changedRecordCount, dataThroughDate };
  } catch (error) {
    await refreshRepository.markFailed({
      runId: run.id,
      errorCode: typeof error?.code === 'string' ? error.code : 'USPTO_BULK_FILE_IMPORT_FAILED',
    }).catch(() => {});
    throw error;
  }
}

function validateRepositories({ trademarkRepository, refreshRepository, batchSize }) {
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
}

/**
 * Import one official daily/incremental USPTO Trademark Applications file.
 * Annual multipart snapshots are deliberately rejected here so a single part
 * can never make an incomplete historical corpus appear production-ready.
 */
export async function importUsptoBulkFile({
  inputPath,
  trademarkRepository,
  refreshRepository,
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  validateRepositories({ trademarkRepository, refreshRepository, batchSize });
  const file = validateUsptoBulkFile(inputPath);
  if (file.annualPart) {
    const error = new Error('Annual USPTO multipart snapshots must be imported as a verified complete part set.');
    error.code = 'USPTO_ANNUAL_MULTIPART_SET_REQUIRED';
    throw error;
  }

  const sourceRelease = path.basename(file.absolutePath, file.extension);
  const run = await refreshRepository.startRun({
    sourceRegistry: 'USPTO',
    requestedSinceDate: null,
    coverageKind: 'incremental',
    sourceRelease,
    expectedFileCount: 1,
  });
  const result = await ingestFiles({
    files: [file],
    run,
    trademarkRepository,
    refreshRepository,
    batchSize,
  });

  return {
    status: 'complete',
    coverageKind: 'incremental',
    runId: run.id,
    inputFile: path.basename(file.absolutePath),
    byteSize: file.byteSize,
    ...result,
  };
}

/**
 * Import a complete annual USPTO Trademark Applications snapshot as one
 * auditable baseline run. Completeness is validated before any database write.
 */
export async function importUsptoAnnualBaseline({
  inputPaths,
  expectedPartCount,
  trademarkRepository,
  refreshRepository,
  batchSize = DEFAULT_BATCH_SIZE,
} = {}) {
  validateRepositories({ trademarkRepository, refreshRepository, batchSize });
  const set = validateAnnualPartSet(inputPaths, expectedPartCount);
  const run = await refreshRepository.startRun({
    sourceRegistry: 'USPTO',
    requestedSinceDate: set.requestedSinceDate,
    coverageKind: 'baseline',
    sourceRelease: set.sourceRelease,
    expectedFileCount: set.expectedPartCount,
  });
  const result = await ingestFiles({
    files: set.files,
    run,
    trademarkRepository,
    refreshRepository,
    batchSize,
  });

  return {
    status: 'complete',
    coverageKind: 'baseline',
    runId: run.id,
    sourceRelease: set.sourceRelease,
    expectedPartCount: set.expectedPartCount,
    discoveredFileCount: set.files.length,
    totalCompressedBytes: set.totalCompressedBytes,
    nominalCoverageEndDate: set.nominalCoverageEndDate,
    ...result,
  };
}
