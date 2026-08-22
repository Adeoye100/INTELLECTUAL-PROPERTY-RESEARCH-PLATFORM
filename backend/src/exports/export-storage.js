import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EXPORT_UUID_PATTERN } from './export-validation.js';

const KEY_PATTERN = /^exports\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

export function exportStorageKey({ firmId, exportId }) {
  if (!EXPORT_UUID_PATTERN.test(firmId) || !EXPORT_UUID_PATTERN.test(exportId)) throw new TypeError('Export storage keys need UUID scopes.');
  return `exports/${firmId.toLowerCase()}/${exportId.toLowerCase()}.pdf`;
}
export function validateExportStorageKey(value) {
  if (typeof value !== 'string' || value.length > 512 || !KEY_PATTERN.test(value) || value.includes('..') || value.includes('\\')) {
    throw new TypeError('Invalid server-generated export storage key.');
  }
  return value;
}
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function validBody(body, maximumBytes) {
  if (!Buffer.isBuffer(body) || body.length < 1 || body.length > maximumBytes) throw new TypeError('Export PDF bytes are invalid or exceed the configured limit.');
  if (!body.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new TypeError('Export bytes are not a PDF document.');
  return body;
}
function contentType(value) {
  if (value !== 'application/pdf') throw new TypeError('Export storage accepts application/pdf only.');
  return value;
}

export class InMemoryPdfStorage {
  constructor({ maxBytes = 10 * 1024 * 1024 } = {}) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024) throw new TypeError('InMemoryPdfStorage needs a valid byte limit.');
    this.maxBytes = maxBytes;
    this.objects = new Map();
  }
  async put({ key, contentType: type, body }) {
    const safeKey = validateExportStorageKey(key); contentType(type); const bytes = validBody(body, this.maxBytes);
    this.objects.set(safeKey, Buffer.from(bytes));
    return { byteSize: bytes.length, checksumSha256: sha256(bytes) };
  }
  async get({ key }) {
    const found = this.objects.get(validateExportStorageKey(key));
    return found ? Buffer.from(found) : null;
  }
  async delete({ key }) { return this.objects.delete(validateExportStorageKey(key)); }
}

/** Private filesystem adapter. It is constructed only when PDF export is
 * enabled; no public bucket or remote URL fallback exists. */
export class FilePdfStorage {
  constructor({ root, maxBytes }) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new TypeError('FilePdfStorage needs an absolute private storage root.');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024) throw new TypeError('FilePdfStorage needs a valid byte limit.');
    this.root = path.resolve(root); this.maxBytes = maxBytes;
  }
  filePath(key) {
    const validated = validateExportStorageKey(key);
    const target = path.resolve(this.root, validated);
    if (!target.startsWith(`${this.root}${path.sep}`)) throw new TypeError('Invalid export storage path.');
    return target;
  }
  async put({ key, contentType: type, body }) {
    const bytes = validBody(body, this.maxBytes); contentType(type); const target = this.filePath(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { mode: 0o600 });
    return { byteSize: bytes.length, checksumSha256: sha256(bytes) };
  }
  async get({ key }) {
    try { return await readFile(this.filePath(key)); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  }
  async delete({ key }) {
    try { await rm(this.filePath(key), { force: true }); return true; } catch { return false; }
  }
}
