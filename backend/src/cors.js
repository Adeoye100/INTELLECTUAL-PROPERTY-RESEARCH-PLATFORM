const DEFAULT_ALLOWED_ORIGINS = new Set(['http://localhost:5173']);
const ALLOWED_METHODS = 'DELETE, GET, OPTIONS, PATCH, POST, PUT';
const ALLOWED_HEADERS = 'Authorization, Content-Type';

/**
 * Adds the intentionally small browser-origin allow-list for the local Vite
 * application. Authentication is bearer-token based, so credentials are not
 * enabled for cross-origin requests.
 */
export function createCorsMiddleware({ allowedOrigins = DEFAULT_ALLOWED_ORIGINS } = {}) {
  const origins = new Set(allowedOrigins);

  return function cors(request, response, next) {
    const origin = request.get('origin');
    if (!origin) return next();

    if (!origins.has(origin)) {
      if (request.method === 'OPTIONS') {
        return response.status(403).json({
          code: 'CORS_ORIGIN_DENIED',
          message: 'This origin is not allowed to access the API.',
        });
      }
      return next();
    }

    response.set({
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Origin': origin,
    });
    response.vary('Origin');

    if (request.method === 'OPTIONS') return response.status(204).end();
    return next();
  };
}
