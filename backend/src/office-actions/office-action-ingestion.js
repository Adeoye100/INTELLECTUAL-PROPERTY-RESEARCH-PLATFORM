import { parseCalendarDate } from '../portfolio/portfolio-mark-validation.js';
import {
  OFFICE_ACTION_DOCUMENT_TYPES,
  OFFICE_ACTION_SUMMARY_METHODS,
  parseOfficeActionSourceMetadata,
} from './office-action-validation.js';

const DOCUMENT_TYPE_SET = new Set(OFFICE_ACTION_DOCUMENT_TYPES);
const SUMMARY_METHOD_SET = new Set(OFFICE_ACTION_SUMMARY_METHODS);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const ALLOWED_INGESTION_FIELDS = new Set([
  'sourceRegistry',
  'sourceReferenceId',
  'applicationNumber',
  'markText',
  'owner',
  'jurisdiction',
  'documentType',
  'officeActionDate',
  'examinerName',
  'examinerReasoningText',
  'summaryMethod',
  'sourceDocumentUrl',
  'sourceMetadata',
  'sourcePublishedAt',
  'sourceUpdatedAt',
]);

function invalid(field, message) {
  const error = new Error(message);
  error.field = field;
  throw error;
}

function text(value, field, maximum, { uppercase = false } = {}) {
  if (typeof value !== 'string') invalid(field, `${field} must be a string.`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maximum) {
    invalid(field, `${field} must be between 1 and ${maximum} characters.`);
  }
  return uppercase ? normalized.toUpperCase() : normalized;
}

function nullableText(value, field, maximum, options) {
  if (value === null || value === undefined || value === '') return null;
  return text(value, field, maximum, options);
}

function sourceDocumentUrl(value, field = 'sourceDocumentUrl') {
  if (value === null || value === undefined || value === '') return null;
  const normalized = text(value, field, 2_048);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    invalid(field, `${field} must be a valid HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    invalid(field, `${field} must be a credential-free HTTP(S) URL without query or fragment.`);
  }
  return parsed.toString();
}

function plainTextReasoning(value, field = 'examinerReasoningText') {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') invalid(field, `${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length > 50_000) {
    invalid(field, `${field} must not exceed 50000 characters.`);
  }
  if (/<\/?[A-Za-z][^>]*>/.test(normalized)) {
    invalid(field, `${field} must be plain text.`);
  }
  return normalized;
}

const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function parseTimestamp(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') invalid(field, `${field} must be a valid ISO timestamp string.`);
  const trimmed = value.trim();
  if (!ISO_TIMESTAMP_REGEX.test(trimmed)) {
    invalid(field, `${field} must be a valid ISO timestamp string.`);
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    invalid(field, `${field} must be a valid ISO timestamp string.`);
  }
  return date.toISOString();
}

function deriveDataThrough(validatedRecords) {
  let maxUpdatedAt = null;
  let maxPublishedAt = null;
  let maxOfficeActionDate = null;

  for (const rec of validatedRecords) {
    if (rec.sourceUpdatedAt && (!maxUpdatedAt || rec.sourceUpdatedAt > maxUpdatedAt)) {
      maxUpdatedAt = rec.sourceUpdatedAt;
    }
    if (rec.sourcePublishedAt && (!maxPublishedAt || rec.sourcePublishedAt > maxPublishedAt)) {
      maxPublishedAt = rec.sourcePublishedAt;
    }
    if (rec.officeActionDate && (!maxOfficeActionDate || rec.officeActionDate > maxOfficeActionDate)) {
      maxOfficeActionDate = rec.officeActionDate;
    }
  }

  const bestIso = maxUpdatedAt || maxPublishedAt;
  if (bestIso) {
    return bestIso.slice(0, 10);
  }
  if (maxOfficeActionDate) {
    return maxOfficeActionDate;
  }
  return null;
}

export function validateIngestionRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('record', 'Record must be a plain object.');
  }

  for (const key of Object.keys(input)) {
    if (FORBIDDEN_KEYS.has(key) || !ALLOWED_INGESTION_FIELDS.has(key)) {
      invalid(key, `Field ${key} is not supported in Office Action ingestion.`);
    }
  }

  const sourceRegistry = text(input.sourceRegistry || 'USPTO', 'sourceRegistry', 100, { uppercase: true });
  if (!/^[A-Z0-9_-]+$/.test(sourceRegistry)) {
    invalid('sourceRegistry', 'sourceRegistry must use A-Z, 0-9, underscore, or hyphen.');
  }

  const sourceReferenceId = text(input.sourceReferenceId, 'sourceReferenceId', 200);

  const docType = text(input.documentType, 'documentType', 80).toLowerCase();
  if (!DOCUMENT_TYPE_SET.has(docType)) {
    invalid('documentType', `documentType must be one of: ${OFFICE_ACTION_DOCUMENT_TYPES.join(', ')}.`);
  }

  const summaryMeth = text(input.summaryMethod || 'registry', 'summaryMethod', 20).toLowerCase();
  if (!SUMMARY_METHOD_SET.has(summaryMeth)) {
    invalid('summaryMethod', `summaryMethod must be one of: ${OFFICE_ACTION_SUMMARY_METHODS.join(', ')}.`);
  }

  const officeActionDate = input.officeActionDate === null || input.officeActionDate === undefined || input.officeActionDate === ''
    ? null
    : parseCalendarDate(input.officeActionDate, 'officeActionDate');

  const sourcePublishedAt = parseTimestamp(input.sourcePublishedAt, 'sourcePublishedAt');
  const sourceUpdatedAt = parseTimestamp(input.sourceUpdatedAt, 'sourceUpdatedAt');

  return {
    sourceRegistry,
    sourceReferenceId,
    applicationNumber: nullableText(input.applicationNumber, 'applicationNumber', 100),
    markText: nullableText(input.markText, 'markText', 200),
    owner: nullableText(input.owner, 'owner', 200),
    jurisdiction: input.jurisdiction ? text(input.jurisdiction, 'jurisdiction', 20, { uppercase: true }) : 'US',
    documentType: docType,
    officeActionDate,
    examinerName: nullableText(input.examinerName, 'examinerName', 200),
    examinerReasoningText: plainTextReasoning(input.examinerReasoningText),
    summaryMethod: summaryMeth,
    sourceDocumentUrl: sourceDocumentUrl(input.sourceDocumentUrl),
    sourceMetadata: parseOfficeActionSourceMetadata(input.sourceMetadata, { strict: false }),
    sourcePublishedAt,
    sourceUpdatedAt,
  };
}

export async function ingestOfficeActionRecords(database, records, options = {}) {
  const defaultRegistry = options.defaultRegistry || options.sourceRegistry || 'USPTO';
  const sourceKind = options.sourceKind || 'trademark-office-actions';

  if (!database || typeof database.query !== 'function') {
    throw new TypeError('ingestOfficeActionRecords requires a database connection.');
  }
  if (sourceKind !== 'trademark-office-actions') {
    const err = new Error(`Unsupported sourceKind '${sourceKind}'. Only 'trademark-office-actions' is supported.`);
    err.code = 'OFFICE_ACTION_CORPUS_UNSUPPORTED_KIND';
    throw err;
  }
  if (!Array.isArray(records) || records.length === 0) {
    const err = new Error('Corpus ingestion input is empty.');
    err.code = 'OFFICE_ACTION_CORPUS_EMPTY';
    throw err;
  }

  const registries = new Set();
  for (const r of records) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      const reg = r.sourceRegistry ? String(r.sourceRegistry).trim().toUpperCase() : defaultRegistry.toUpperCase();
      registries.add(reg);
    }
  }

  if (registries.size > 1) {
    const err = new Error('Mixed sourceRegistry values in single ingestion batch are forbidden.');
    err.code = 'OFFICE_ACTION_CORPUS_MIXED_REGISTRY';
    throw err;
  }

  const runRegistry = registries.size === 1 ? Array.from(registries)[0] : defaultRegistry.toUpperCase();

  let runId = null;
  try {
    const runRes = await database.query(
      `INSERT INTO office_action_corpus_runs (source_registry, status, started_at)
       VALUES ($1, 'running', NOW())
       RETURNING id`,
      [runRegistry],
    );
    runId = runRes.rows?.[0]?.id || null;
  } catch (err) {
    const createErr = new Error(`Failed to create corpus run ledger entry: ${err.message}`);
    createErr.code = 'OFFICE_ACTION_CORPUS_RUN_CREATE_FAILED';
    throw createErr;
  }

  if (!runId) {
    const createErr = new Error('Failed to create corpus run ledger entry: returned no ID');
    createErr.code = 'OFFICE_ACTION_CORPUS_RUN_CREATE_FAILED';
    throw createErr;
  }

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let rejected = 0;
  const validatedRecords = [];

  try {
    for (const item of records) {
      processed++;
      let validated;
      try {
        validated = validateIngestionRecord(item);
      } catch (_err) {
        rejected++;
        continue;
      }
      validatedRecords.push(validated);

      const existingResult = await database.query(
        `SELECT id, application_number, mark_text, owner, jurisdiction, document_type,
                office_action_date, examiner_name, examiner_reasoning_text, summary_method,
                source_document_url, source_metadata, source_published_at, source_updated_at
         FROM office_action_documents
         WHERE source_registry = $1 AND source_reference_id = $2`,
        [validated.sourceRegistry, validated.sourceReferenceId],
      );

      if (existingResult.rows.length === 0) {
        await database.query(
          `INSERT INTO office_action_documents (
            source_registry, source_reference_id, application_number, mark_text, owner,
            jurisdiction, document_type, office_action_date, examiner_name,
            examiner_reasoning_text, summary_method, source_document_url, source_metadata,
            source_published_at, source_updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            validated.sourceRegistry, validated.sourceReferenceId, validated.applicationNumber,
            validated.markText, validated.owner, validated.jurisdiction, validated.documentType,
            validated.officeActionDate, validated.examinerName, validated.examinerReasoningText,
            validated.summaryMethod, validated.sourceDocumentUrl, JSON.stringify(validated.sourceMetadata),
            validated.sourcePublishedAt, validated.sourceUpdatedAt,
          ],
        );
        inserted++;
      } else {
        const row = existingResult.rows[0];
        const existingDate = row.office_action_date
          ? (row.office_action_date instanceof Date ? row.office_action_date.toISOString().slice(0, 10) : String(row.office_action_date).slice(0, 10))
          : null;
        const existingPub = row.source_published_at
          ? (row.source_published_at instanceof Date ? row.source_published_at.toISOString() : new Date(row.source_published_at).toISOString())
          : null;
        const existingUpd = row.source_updated_at
          ? (row.source_updated_at instanceof Date ? row.source_updated_at.toISOString() : new Date(row.source_updated_at).toISOString())
          : null;

        const isSame = (
          (row.application_number ?? null) === validated.applicationNumber
          && (row.mark_text ?? null) === validated.markText
          && (row.owner ?? null) === validated.owner
          && (row.jurisdiction ?? null) === validated.jurisdiction
          && row.document_type === validated.documentType
          && existingDate === validated.officeActionDate
          && (row.examiner_name ?? null) === validated.examinerName
          && (row.examiner_reasoning_text ?? null) === validated.examinerReasoningText
          && row.summary_method === validated.summaryMethod
          && (row.source_document_url ?? null) === validated.sourceDocumentUrl
          && JSON.stringify(row.source_metadata ?? {}) === JSON.stringify(validated.sourceMetadata)
          && existingPub === validated.sourcePublishedAt
          && existingUpd === validated.sourceUpdatedAt
        );

        if (isSame) {
          unchanged++;
        } else {
          await database.query(
            `UPDATE office_action_documents
             SET application_number = $3, mark_text = $4, owner = $5, jurisdiction = $6,
                 document_type = $7, office_action_date = $8, examiner_name = $9,
                 examiner_reasoning_text = $10, summary_method = $11, source_document_url = $12,
                 source_metadata = $13, source_published_at = $14, source_updated_at = $15,
                 updated_at = NOW()
             WHERE source_registry = $1 AND source_reference_id = $2`,
            [
              validated.sourceRegistry, validated.sourceReferenceId, validated.applicationNumber,
              validated.markText, validated.owner, validated.jurisdiction, validated.documentType,
              validated.officeActionDate, validated.examinerName, validated.examinerReasoningText,
              validated.summaryMethod, validated.sourceDocumentUrl, JSON.stringify(validated.sourceMetadata),
              validated.sourcePublishedAt, validated.sourceUpdatedAt,
            ],
          );
          updated++;
        }
      }
    }

    if (processed > 0 && (inserted + updated + unchanged) === 0) {
      const err = new Error('All ingestion records were rejected.');
      err.code = 'ALL_RECORDS_REJECTED';
      throw err;
    }

    const dataThrough = deriveDataThrough(validatedRecords);
    try {
      await database.query(
        `UPDATE office_action_corpus_runs
         SET status = 'complete', completed_at = NOW(),
             processed_count = $2, inserted_count = $3, updated_count = $4,
             unchanged_count = $5, rejected_count = $6, data_through = $7
         WHERE id = $1`,
        [runId, processed, inserted, updated, unchanged, rejected, dataThrough],
      );
    } catch (err) {
      const updateErr = new Error(`Failed to update corpus run ledger status: ${err.message}`);
      updateErr.code = 'OFFICE_ACTION_CORPUS_RUN_UPDATE_FAILED';
      throw updateErr;
    }

    return { processed, inserted, updated, unchanged, rejected, dataThrough, runId };
  } catch (err) {
    if (runId) {
      const errorCode = typeof err?.code === 'string' ? err.code : 'INGESTION_FAILED';
      try {
        await database.query(
          `UPDATE office_action_corpus_runs
           SET status = 'failed', completed_at = NOW(), error_code = $2,
               processed_count = $3, inserted_count = $4, updated_count = $5,
               unchanged_count = $6, rejected_count = $7
           WHERE id = $1`,
          [runId, errorCode, processed, inserted, updated, unchanged, rejected],
        );
      } catch (_subErr) {
        // ignore secondary error writing failure ledger
      }
    }
    throw err;
  }
}


