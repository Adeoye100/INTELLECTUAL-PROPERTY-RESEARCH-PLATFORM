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
  };
}

export async function ingestOfficeActionRecords(database, records) {
  if (!database || typeof database.query !== 'function') {
    throw new TypeError('ingestOfficeActionRecords requires a database connection.');
  }
  if (!Array.isArray(records)) {
    throw new TypeError('ingestOfficeActionRecords requires an array of records.');
  }

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let rejected = 0;

  for (const item of records) {
    processed++;
    let validated;
    try {
      validated = validateIngestionRecord(item);
    } catch (err) {
      rejected++;
      continue;
    }

    const existingResult = await database.query(
      `SELECT id, application_number, mark_text, owner, jurisdiction, document_type,
              office_action_date, examiner_name, examiner_reasoning_text, summary_method,
              source_document_url, source_metadata
       FROM office_action_documents
       WHERE source_registry = $1 AND source_reference_id = $2`,
      [validated.sourceRegistry, validated.sourceReferenceId],
    );

    if (existingResult.rows.length === 0) {
      await database.query(
        `INSERT INTO office_action_documents (
          source_registry, source_reference_id, application_number, mark_text, owner,
          jurisdiction, document_type, office_action_date, examiner_name,
          examiner_reasoning_text, summary_method, source_document_url, source_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          validated.sourceRegistry, validated.sourceReferenceId, validated.applicationNumber,
          validated.markText, validated.owner, validated.jurisdiction, validated.documentType,
          validated.officeActionDate, validated.examinerName, validated.examinerReasoningText,
          validated.summaryMethod, validated.sourceDocumentUrl, JSON.stringify(validated.sourceMetadata),
        ],
      );
      inserted++;
    } else {
      const row = existingResult.rows[0];
      const existingDate = row.office_action_date
        ? (row.office_action_date instanceof Date ? row.office_action_date.toISOString().slice(0, 10) : String(row.office_action_date).slice(0, 10))
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
      );

      if (isSame) {
        unchanged++;
      } else {
        await database.query(
          `UPDATE office_action_documents
           SET application_number = $3, mark_text = $4, owner = $5, jurisdiction = $6,
               document_type = $7, office_action_date = $8, examiner_name = $9,
               examiner_reasoning_text = $10, summary_method = $11, source_document_url = $12,
               source_metadata = $13, updated_at = NOW()
           WHERE source_registry = $1 AND source_reference_id = $2`,
          [
            validated.sourceRegistry, validated.sourceReferenceId, validated.applicationNumber,
            validated.markText, validated.owner, validated.jurisdiction, validated.documentType,
            validated.officeActionDate, validated.examinerName, validated.examinerReasoningText,
            validated.summaryMethod, validated.sourceDocumentUrl, JSON.stringify(validated.sourceMetadata),
          ],
        );
        updated++;
      }
    }
  }

  return { processed, inserted, updated, unchanged, rejected };
}
