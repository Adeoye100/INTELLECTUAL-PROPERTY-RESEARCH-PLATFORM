/**
 * @typedef {object} NormalizedTrademarkRecord
 * @property {string} sourceReferenceId
 * @property {string} markText
 * @property {string | null} owner
 * @property {string} jurisdiction
 * @property {number[]} niceClasses
 * @property {string} status
 * @property {string | null} rawStatusCode
 * @property {string | null} filingDate ISO-8601 calendar date.
 * @property {string} sourceRegistry
 * @property {string | null} sourceUpdatedAt ISO-8601 calendar date.
 */

/**
 * @typedef {object} TrademarkStatus
 * @property {string} referenceId
 * @property {string} sourceRegistry
 * @property {string} status
 * @property {string | null} statusCode
 * @property {unknown} raw
 */

export class NotSupportedError extends Error {
  constructor(operation, sourceName, reason) {
    super(`${sourceName} does not support ${operation}: ${reason}`);
    this.name = 'NotSupportedError';
    this.code = 'REGISTRY_OPERATION_NOT_SUPPORTED';
    this.operation = operation;
    this.sourceName = sourceName;
  }
}

export class RegistryConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryConfigurationError';
    this.code = 'REGISTRY_CONFIGURATION_ERROR';
  }
}

export class RegistryHttpError extends Error {
  constructor(sourceName, operation, status) {
    super(`${sourceName} ${operation} failed with HTTP ${status}.`);
    this.name = 'RegistryHttpError';
    this.code = 'REGISTRY_HTTP_ERROR';
    this.status = status;
    this.sourceName = sourceName;
  }
}

export class RegistryResponseSizeError extends Error {
  constructor(sourceName, operation) {
    super(`${sourceName} ${operation} response exceeded the configured size limit.`);
    this.name = 'RegistryResponseSizeError';
    this.code = 'REGISTRY_RESPONSE_TOO_LARGE';
    this.sourceName = sourceName;
  }
}

// JavaScript does not enforce interfaces at runtime. This base class makes the
// contract executable while JSDoc supplies the record/status shapes to editors.
export class RegistryAdapter {
  constructor(sourceName) {
    if (new.target === RegistryAdapter) {
      throw new TypeError('RegistryAdapter is an abstract contract.');
    }
    this.sourceName = sourceName;
  }

  /** @returns {AsyncIterable<NormalizedTrademarkRecord>} */
  async *fetchUpdates(_since) {
    throw new NotSupportedError('fetchUpdates', this.sourceName, 'not implemented');
  }

  /** @returns {Promise<TrademarkStatus>} */
  async getStatus(_referenceId) {
    throw new NotSupportedError('getStatus', this.sourceName, 'not implemented');
  }
}
