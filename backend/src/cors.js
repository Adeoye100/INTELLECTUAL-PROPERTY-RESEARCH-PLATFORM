const DEFAULT_ALLOWED_ORIGINS = new Set(['http://localhost:5173']);
const ALLOWED_METHODS = 'DELETE, GET, OPTIONS, PATCH, POST';
const ALLOWED_HEADERS = 'Authorization, Content-Type';
const MAX_AGE_SECONDS = '600';

/**
 * Adds the intentionally small browser-origin allow-list for the local Vite
 * application. Authentication is bearer-token based, so credentials are not
 * enabled for cross-origin requests.
 */
export function createCorsMiddleware({ allowedOrigins = DEFAULT_ALLOWED_ORIGINS } = {}) {
  if (!allowedOrigins || typeof allowedOrigins[Symbol.iterator] !== 'function') {
    throw new TypeError('allowedOrigins must be an iterable of explicit origins.');
  }
  const origins = new Set();
  for (const value of allowedOrigins) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new TypeError('allowedOrigins must contain valid absolute origins.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value
      || url.username || url.password || url.search || url.hash) {
      throw new TypeError('allowedOrigins must contain origin-only HTTP(S) URLs.');
    }
    origins.add(value);
  }
  if (origins.size === 0) throw new TypeError('allowedOrigins must not be empty.');

  return function cors(request, response, next) {
    const origin = request.get('origin');
    if (!origin) return next();

    if (!origins.has(origin)) {
      return response.status(403).json({
        code: 'CORS_ORIGIN_DENIED',
        message: 'This origin is not allowed to access the API.',
      });
    }

    response.set({
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Max-Age': MAX_AGE_SECONDS,
    });
    response.vary('Origin');

    if (request.method === 'OPTIONS') return response.status(204).end();
    return next();
  };
}
