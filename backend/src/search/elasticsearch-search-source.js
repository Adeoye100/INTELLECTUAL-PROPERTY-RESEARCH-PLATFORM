import { TRADEMARKS_COMPOSITE_INDEX } from './elasticsearch-indices.js';

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_RESULTS = 50;
const SOURCE_FIELDS = [
  'mark_text',
  'owner',
  'jurisdiction',
  'nice_classes',
  'status',
  'filing_date',
  'source_registry',
  'source_reference_id',
];

export class ElasticsearchSearchSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ElasticsearchSearchSourceError';
    this.code = code;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function addOptionalTermFilter(filters, field, value) {
  if (optionalNonEmptyString(value) !== null) filters.push({ term: { [field]: value } });
}

function buildQuery(query = {}, sourceName, maxResults) {
  const filters = [{ term: { source_registry: sourceName } }];
  if (Array.isArray(query.jurisdictions) && query.jurisdictions.length > 0) {
    filters.push({ terms: { jurisdiction: query.jurisdictions } });
  }
  if (Array.isArray(query.niceClasses) && query.niceClasses.length > 0) {
    filters.push({ terms: { nice_classes: query.niceClasses } });
  }
  addOptionalTermFilter(filters, 'status', query.status);
  addOptionalTermFilter(filters, 'owner', query.owner);

  const filingDate = {};
  if (optionalNonEmptyString(query.filedFrom) !== null) filingDate.gte = query.filedFrom;
  if (optionalNonEmptyString(query.filedTo) !== null) filingDate.lte = query.filedTo;
  if (Object.keys(filingDate).length > 0) filters.push({ range: { filing_date: filingDate } });

  const bool = { filter: filters };
  if (optionalNonEmptyString(query.mark) !== null) {
    bool.must = [{
      bool: {
        minimum_should_match: 1,
        should: [
          { match: { mark_text: { query: query.mark, fuzziness: 'AUTO' } } },
          { match: { 'mark_text.phonetic': { query: query.mark } } },
        ],
      },
    }];
  }

  return {
    size: maxResults,
    _source: SOURCE_FIELDS,
    query: { bool },
  };
}

function malformedResponse() {
  return new ElasticsearchSearchSourceError(
    'ELASTICSEARCH_SEARCH_RESPONSE_INVALID',
    'Elasticsearch search response was malformed.',
  );
}

function malformedHit() {
  return new ElasticsearchSearchSourceError(
    'ELASTICSEARCH_SEARCH_HIT_INVALID',
    'Elasticsearch search result was malformed.',
  );
}

function mapHit(hit, sourceName) {
  if (!hit || typeof hit !== 'object' || !isNonEmptyString(hit._id)) throw malformedHit();
  const source = hit._source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw malformedHit();
  if (!isNonEmptyString(source.mark_text)
    || !isNonEmptyString(source.jurisdiction)
    || !Array.isArray(source.nice_classes)
    || !source.nice_classes.every((niceClass) => Number.isInteger(niceClass))
    || !isNonEmptyString(source.status)
    || !isNonEmptyString(source.source_registry)
    || source.source_registry !== sourceName
    || !isNonEmptyString(source.source_reference_id)
    || (source.owner !== undefined && source.owner !== null && typeof source.owner !== 'string')
    || (source.filing_date !== undefined && source.filing_date !== null
      && typeof source.filing_date !== 'string')
    || (hit._score !== undefined && hit._score !== null && typeof hit._score !== 'number')) {
    throw malformedHit();
  }

  return {
    recordId: hit._id,
    markText: source.mark_text,
    owner: source.owner ?? null,
    jurisdiction: source.jurisdiction,
    niceClasses: source.nice_classes,
    status: source.status,
    filingDate: source.filing_date ?? null,
    sourceRegistry: source.source_registry,
    sourceReferenceId: source.source_reference_id,
    relevanceScore: hit._score ?? null,
  };
}

export class ElasticsearchSearchSource {
  constructor({
    sourceName,
    baseUrl,
    indexName = TRADEMARKS_COMPOSITE_INDEX,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResults = DEFAULT_MAX_RESULTS,
  } = {}) {
    if (!isNonEmptyString(sourceName)) throw new TypeError('sourceName must be a non-empty string.');
    let parsedBaseUrl;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      throw new TypeError('baseUrl must be a valid HTTP(S) URL.');
    }
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
      throw new TypeError('baseUrl must be a valid HTTP(S) URL.');
    }
    if (!isNonEmptyString(indexName)) throw new TypeError('indexName must be a non-empty string.');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('timeoutMs must be a positive finite number.');
    }
    if (!Number.isInteger(maxResults) || maxResults <= 0) {
      throw new TypeError('maxResults must be a positive integer.');
    }

    this.sourceName = sourceName.trim();
    this.baseUrl = parsedBaseUrl.toString().replace(/\/$/, '');
    this.indexName = indexName.trim();
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxResults = maxResults;
    this.search = this.search.bind(this);
  }

  async search(query = {}) {
    const controller = new AbortController();
    let timer;
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timeout = new ElasticsearchSearchSourceError(
          'ELASTICSEARCH_SEARCH_TIMEOUT',
          'Elasticsearch search request timed out.',
        );
        controller.abort();
        reject(timeout);
      }, this.timeoutMs);
    });

    const request = Promise.resolve().then(() => this.fetchImpl(
      `${this.baseUrl}/${encodeURIComponent(this.indexName)}/_search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildQuery(query, this.sourceName, this.maxResults)),
        signal: controller.signal,
      },
    ));

    try {
      let response;
      try {
        response = await Promise.race([request, timeoutPromise]);
      } catch (error) {
        if (error === timeout) throw error;
        throw new ElasticsearchSearchSourceError(
          'ELASTICSEARCH_SEARCH_NETWORK_ERROR',
          'Elasticsearch search request failed.',
        );
      }
      if (!response || response.ok !== true) {
        throw new ElasticsearchSearchSourceError(
          'ELASTICSEARCH_SEARCH_HTTP_ERROR',
          `Elasticsearch search returned HTTP ${Number.isInteger(response?.status) ? response.status : 'an error'}.`,
        );
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new ElasticsearchSearchSourceError(
          'ELASTICSEARCH_SEARCH_INVALID_JSON',
          'Elasticsearch search response was not valid JSON.',
        );
      }
      if (!payload || typeof payload !== 'object' || !payload.hits
        || !Array.isArray(payload.hits.hits)) throw malformedResponse();
      return payload.hits.hits.map((hit) => mapHit(hit, this.sourceName));
    } finally {
      clearTimeout(timer);
    }
  }
}
