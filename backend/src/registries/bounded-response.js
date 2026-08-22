import { Readable, Transform } from 'node:stream';
import { RegistryResponseSizeError } from './registry-adapter.js';

export const DEFAULT_REGISTRY_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_REGISTRY_COMPRESSED_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_REGISTRY_DECOMPRESSED_BYTES = 100 * 1024 * 1024;
export const DEFAULT_MAX_REGISTRY_JSON_BYTES = 512 * 1024;

function validLimit(value, name) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 512 * 1024 * 1024) {
    throw new TypeError(`${name} must be an integer between 1 and 536870912.`);
  }
  return value;
}

function declaredLength(response) {
  const raw = response?.headers?.get?.('content-length');
  if (raw === null || raw === undefined || raw === '') return null;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function sizeError(sourceName, operation) {
  return new RegistryResponseSizeError(sourceName, operation);
}

export function toNodeReadable(body) {
  if (!body) throw new Error('Registry response did not contain a body.');
  return typeof body.pipe === 'function' ? body : Readable.fromWeb(body);
}

/**
 * A Fetch response body is decoded by many Fetch implementations. We therefore
 * reject the declared transport (compressed) length before reading and always
 * enforce a second streaming limit over the bytes made available to the parser.
 * This covers absent or dishonest Content-Length values without returning a
 * truncated payload.
 */
export function limitResponseBody(response, {
  sourceName,
  operation,
  maxCompressedBytes = DEFAULT_MAX_REGISTRY_COMPRESSED_BYTES,
  maxDecompressedBytes = DEFAULT_MAX_REGISTRY_DECOMPRESSED_BYTES,
  abortController = null,
} = {}) {
  validLimit(maxCompressedBytes, 'maxCompressedBytes');
  validLimit(maxDecompressedBytes, 'maxDecompressedBytes');
  const declared = declaredLength(response);
  if (declared !== null && declared > maxCompressedBytes) {
    abortController?.abort();
    throw sizeError(sourceName, operation);
  }
  let processed = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      processed += size;
      if (processed > maxDecompressedBytes) {
        abortController?.abort();
        callback(sizeError(sourceName, operation));
        return;
      }
      callback(null, chunk);
    },
  });
  return toNodeReadable(response.body).pipe(limiter);
}

export function limitReadableBytes(readable, {
  sourceName,
  operation,
  maxBytes,
  abortController = null,
  onBytes = null,
} = {}) {
  validLimit(maxBytes, 'maxBytes');
  if (onBytes !== null && typeof onBytes !== 'function') throw new TypeError('onBytes must be a function when provided.');
  let processed = 0;
  return toNodeReadable(readable).pipe(new Transform({
    transform(chunk, _encoding, callback) {
      const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      processed += size;
      if (processed > maxBytes) {
        abortController?.abort();
        callback(sizeError(sourceName, operation));
        return;
      }
      onBytes?.(size);
      callback(null, chunk);
    },
  }));
}

export async function requestBoundedResponse({
  fetchImpl,
  url,
  sourceName,
  operation,
  accept,
  timeoutMs = DEFAULT_REGISTRY_TIMEOUT_MS,
  maxCompressedBytes = DEFAULT_MAX_REGISTRY_COMPRESSED_BYTES,
  maxDecompressedBytes = DEFAULT_MAX_REGISTRY_DECOMPRESSED_BYTES,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Registry request needs fetch.');
  validLimit(timeoutMs, 'timeoutMs');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: accept }, redirect: 'error', signal: controller.signal,
    });
    const body = limitResponseBody(response, {
      sourceName, operation, maxCompressedBytes, maxDecompressedBytes, abortController: controller,
    });
    return {
      response,
      body,
      close() { clearTimeout(timeout); },
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export async function readBoundedText(request, {
  maxBytes = DEFAULT_MAX_REGISTRY_JSON_BYTES,
  sourceName = 'REGISTRY',
  operation = 'response read',
} = {}) {
  validLimit(maxBytes, 'maxBytes');
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of request.body) {
      total += chunk.length;
      if (total > maxBytes) throw sizeError(sourceName, operation);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total).toString('utf8');
  } finally {
    request.close?.();
  }
}

export async function readBoundedJson(request, { sourceName, operation, maxBytes = DEFAULT_MAX_REGISTRY_JSON_BYTES } = {}) {
  const text = await readBoundedText(request, { maxBytes, sourceName, operation });
  try { return JSON.parse(text); } catch { throw new Error(`${sourceName} ${operation} returned invalid JSON.`); }
}
