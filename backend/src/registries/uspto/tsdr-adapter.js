import {
  NotSupportedError,
  RegistryAdapter,
  RegistryConfigurationError,
  RegistryHttpError,
} from '../registry-adapter.js';
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

export class UsptoTsdrAdapter extends RegistryAdapter {
  constructor({
    apiKey = process.env.USPTO_TSDR_API_KEY,
    baseUrl = DEFAULT_USPTO_TSDR_BASE_URL,
    fetchImpl = globalThis.fetch,
  } = {}) {
    super(USPTO_TSDR_SOURCE_NAME);
    this.apiKey = apiKey?.trim();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
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
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'USPTO-API-KEY': this.apiKey,
      },
    });
    if (!response.ok) throw new RegistryHttpError(this.sourceName, 'getStatus', response.status);

    const payload = await response.json();
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
