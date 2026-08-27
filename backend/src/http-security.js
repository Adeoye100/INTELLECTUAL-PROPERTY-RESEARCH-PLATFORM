import { AppError } from './errors.js';

export const MAX_REQUEST_TARGET_BYTES = 4 * 1024;
export const MAX_JSON_BODY_BYTES = 16 * 1024;

/**
 * API responses never need active browser content. These headers are kept
 * dependency-free because the locked package set does not include Helmet.
 */
export function createSecurityHeadersMiddleware() {
  return (_request, response, next) => {
    response.set({
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-DNS-Prefetch-Control': 'off',
      'X-Frame-Options': 'DENY',
    });
    next();
  };
}

/** Bound request-target parsing before route/query handling. express.json()
 * remains responsible for streaming and enforcing the same JSON body limit. */
export function createRequestBoundsMiddleware({
  maxRequestTargetBytes = MAX_REQUEST_TARGET_BYTES,
  maxJsonBodyBytes = MAX_JSON_BODY_BYTES,
} = {}) {
  if (!Number.isSafeInteger(maxRequestTargetBytes) || maxRequestTargetBytes < 256
    || !Number.isSafeInteger(maxJsonBodyBytes) || maxJsonBodyBytes < 1024) {
    throw new TypeError('HTTP request bounds must be safe positive integers.');
  }
  return (request, _response, next) => {
    const target = request.originalUrl ?? request.url ?? '';
    if (Buffer.byteLength(target, 'utf8') > maxRequestTargetBytes) {
      return next(new AppError(414, 'REQUEST_TARGET_TOO_LARGE', 'Request target exceeds the configured limit.'));
    }
    const contentLength = request.get('content-length');
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxJsonBodyBytes) {
      return next(new AppError(413, 'REQUEST_BODY_TOO_LARGE', 'Request body exceeds the configured limit.'));
    }
    return next();
  };
}

/** The initial deployment does not accept uploads or HTML form bodies. Reject
 * multipart before route validation so no future route accidentally treats an
 * unbounded upload as JSON. */
export function rejectUnsupportedRequestContent() {
  return (request, _response, next) => {
    const contentType = request.get('content-type');
    if (!contentType) return next();
    const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
    if (mediaType === 'application/json' || mediaType === 'application/problem+json') return next();
    return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'This API accepts JSON request bodies only.'));
  };
}
