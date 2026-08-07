import { TextDecoder } from 'node:util';
import { SaxesParser } from 'saxes';
import { USPTO_REGISTRY } from './constants.js';
import { normalizeUsptoStatus } from './status.js';

function asIsoDate(value) {
  if (!/^\d{8}$/.test(value ?? '') || value === '00000000') return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

const normalizedText = (value) => value.replace(/\s+/g, ' ').trim();

function toNormalizedRecord(caseFile) {
  const markText = normalizedText(caseFile.markText);
  const sourceReferenceId = normalizedText(caseFile.serialNumber);
  if (!sourceReferenceId || !markText) return null;

  const niceClasses = [...new Set(caseFile.niceClasses
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0))]
    .sort((left, right) => left - right);
  const owners = [...new Set(caseFile.owners.map(normalizedText).filter(Boolean))];

  return {
    sourceReferenceId,
    markText,
    owner: owners.length ? owners.join('; ') : null,
    jurisdiction: 'US',
    niceClasses,
    status: normalizeUsptoStatus(caseFile),
    rawStatusCode: caseFile.statusCode || null,
    filingDate: asIsoDate(caseFile.filingDate),
    sourceRegistry: USPTO_REGISTRY,
    sourceUpdatedAt: asIsoDate(caseFile.transactionDate),
  };
}

function relativeCasePath(path) {
  const caseIndex = path.indexOf('case-file');
  return caseIndex === -1 ? '' : path.slice(caseIndex).join('/');
}

/**
 * Stream records from the verified USPTO Trademark Applications DTD v2.0
 * hierarchy without materializing a 50+ MB daily document in memory.
 */
export async function* parseUsptoBulkXml(readable) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const path = [];
  const ready = [];
  let currentCase = null;
  let text = '';

  const parser = new SaxesParser({ xmlns: false });
  parser.on('opentag', (tag) => {
    path.push(tag.name);
    text = '';
    if (tag.name === 'case-file') {
      currentCase = {
        serialNumber: '',
        transactionDate: '',
        filingDate: '',
        statusCode: '',
        markText: '',
        abandonmentDate: '',
        cancellationDate: '',
        niceClasses: [],
        owners: [],
      };
    }
  });
  parser.on('text', (value) => { text += value; });
  parser.on('cdata', (value) => { text += value; });
  parser.on('closetag', () => {
    const casePath = relativeCasePath(path);
    const value = normalizedText(text);
    if (currentCase) {
      if (casePath === 'case-file/serial-number') currentCase.serialNumber = value;
      else if (casePath === 'case-file/transaction-date') currentCase.transactionDate = value;
      else if (casePath === 'case-file/case-file-header/filing-date') currentCase.filingDate = value;
      else if (casePath === 'case-file/case-file-header/status-code') currentCase.statusCode = value;
      else if (casePath === 'case-file/case-file-header/mark-identification') currentCase.markText = value;
      else if (casePath === 'case-file/case-file-header/abandonment-date') {
        currentCase.abandonmentDate = asIsoDate(value);
      } else if (casePath === 'case-file/case-file-header/cancellation-date') {
        currentCase.cancellationDate = asIsoDate(value);
      } else if (casePath === 'case-file/classifications/classification/international-code') {
        currentCase.niceClasses.push(value);
      } else if (casePath === 'case-file/case-file-owners/case-file-owner/party-name') {
        currentCase.owners.push(value);
      } else if (casePath === 'case-file') {
        const record = toNormalizedRecord(currentCase);
        if (record) ready.push(record);
        currentCase = null;
      }
    }
    path.pop();
    text = '';
  });

  for await (const chunk of readable) {
    parser.write(decoder.decode(chunk, { stream: true }));
    while (ready.length) yield ready.shift();
  }
  parser.write(decoder.decode());
  parser.close();
  while (ready.length) yield ready.shift();
}
