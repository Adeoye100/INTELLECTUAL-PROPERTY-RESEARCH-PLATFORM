import {
  NotSupportedError,
  RegistryAdapter,
  RegistryConfigurationError,
  RegistryHttpError,
} from '../registry-adapter.js';
import { DEFAULT_MAX_REGISTRY_JSON_BYTES, readBoundedJson, requestBoundedResponse } from '../bounded-response.js';
import {
  DEFAULT_USPTO_TSDR_BASE_URL,
  USPTO_REGISTRY,
  USPTO_TSDR_SOURCE_NAME,
} from './constants.js';

function serialNumber(referenceId) {
  const normalized = String(referenceId ?? '').replace(/[\s-]/g, '');
  if (!/^\d{8}$/.test(normalized)) {
    throw new TypeError('USPTO TSDR referenceId must be an eight-digit serial number.');
  }
  return normalized;
}

function trustedBaseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError('USPTO TSDR base URL must be a valid HTTP(S) URL.'); }
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (!['http:', 'https:'].includes(parsed.protocol) || (parsed.protocol !== 'https:' && !loopback)
    || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('USPTO TSDR base URL must use credential-free HTTPS except for loopback testing.');
  }
  return parsed.toString().replace(/\/$/, '');
}

export class UsptoTsdrAdapter extends RegistryAdapter {
  constructor({
    apiKey = process.env.USPTO_TSDR_API_KEY,
    baseUrl = DEFAULT_USPTO_TSDR_BASE_URL,
    fetchImpl = globalThis.fetch,
    maxJsonBytes = DEFAULT_MAX_REGISTRY_JSON_BYTES,
  } = {}) {
    super(USPTO_TSDR_SOURCE_NAME);
    this.apiKey = apiKey?.trim();
    this.baseUrl = trustedBaseUrl(baseUrl);
    if (typeof fetchImpl !== 'function') throw new TypeError('USPTO TSDR adapter needs fetch.');
    if (!Number.isSafeInteger(maxJsonBytes) || maxJsonBytes < 1 || maxJsonBytes > 512 * 1024 * 1024) {
      throw new TypeError('USPTO TSDR maxJsonBytes must be a bounded positive byte count.');
    }
    this.fetchImpl = fetchImpl;
    this.maxJsonBytes = maxJsonBytes;
  }

  async *fetchUpdates(_since) {
    throw new NotSupportedError(
      'fetchUpdates',
      this.sourceName,
      'TSDR is a case lookup API, not a bulk search/update feed',
    );
  }

  async getStatus(referenceId) {
    if (!this.apiKey) {
      throw new RegistryConfigurationError(
        'USPTO TSDR getStatus requires USPTO_TSDR_API_KEY; set it before making a live lookup.',
      );
    }

    const serial = serialNumber(referenceId);
    const url = `${this.baseUrl}/ts/cd/casestatus/sn${serial}/info.json`;
    const request = await requestBoundedResponse({
      fetchImpl: (target, options) => this.fetchImpl(target, {
        ...options,
        headers: { ...options.headers, 'USPTO-API-KEY': this.apiKey },
      }),
      url, sourceName: this.sourceName, operation: 'getStatus', accept: 'application/json',
      maxCompressedBytes: this.maxJsonBytes, maxDecompressedBytes: this.maxJsonBytes,
    });
    if (!request.response.ok) {
      request.close();
      throw new RegistryHttpError(this.sourceName, 'getStatus', request.response.status);
    }

    const payload = await readBoundedJson(request, {
      sourceName: this.sourceName, operation: 'getStatus', maxBytes: this.maxJsonBytes,
    });
    const statusCode = payload?.statusCode == null ? null : String(payload.statusCode);
    return {
      referenceId: serial,
      sourceRegistry: USPTO_REGISTRY,
      status: payload?.statusDescription ?? statusCode ?? 'unknown',
      statusCode,
      raw: payload,
    };
  }
}
