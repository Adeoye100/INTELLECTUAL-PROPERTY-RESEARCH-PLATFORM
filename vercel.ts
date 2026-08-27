// Keep this file type-checkable with the frontend's browser-oriented TypeScript
// project; Vercel provides the real Node `process` object at config-build time.
type Environment = Record<string, string | undefined>;
type ResponseHeader = { key: string; value: string };

declare const process: { env: Environment };

function requiredOrigin(name: string, environment: Environment): string {
  const value = environment[name]?.trim();
  if (!value || /your[-_]|placeholder|replace[-_]?me|change[-_]?me|\.invalid|<[^>]+>/i.test(value)) {
    throw new Error(`${name} must be a configured non-placeholder HTTPS origin before a Vercel build.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
  if (
    url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' ||
    url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error(`${name} must be an HTTPS origin without credentials, query, fragment, or path.`);
  }
  return url.origin;
}

function requiredApiOrigin(environment: Environment): string {
  const value = environment.VITE_API_BASE_URL?.trim();
  if (!value || /your[-_]|placeholder|replace[-_]?me|change[-_]?me|\.invalid|<[^>]+>|localhost|127\.0\.0\.1/i.test(value)) {
    throw new Error('VITE_API_BASE_URL must be a configured non-local HTTPS API URL before a Vercel build.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_BASE_URL must be a valid absolute URL.');
  }
  if (url.protocol !== 'https:' || url.pathname !== '/api/v1' || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_BASE_URL must be an HTTPS URL ending exactly in /api/v1.');
  }
  return url.origin;
}

function responseHeader(key: unknown, value: unknown): ResponseHeader {
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('Vercel response header key must be a non-empty string.');
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Vercel response header ${key} must have a non-empty string value.`);
  }
  return { key, value };
}

export function createVercelConfig(environment: Environment) {
  const supabaseOrigin = requiredOrigin('VITE_SUPABASE_URL', environment);
  const apiOrigin = requiredApiOrigin(environment);
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    // React/Recharts use style attributes for charts and progress indicators.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${supabaseOrigin} ${apiOrigin}`,
    "worker-src 'self' blob:",
  ].join('; ');

  return {
    framework: 'vite',
    installCommand: 'corepack enable && cd frontend && pnpm install --frozen-lockfile',
    buildCommand: 'cd frontend && pnpm run build',
    outputDirectory: 'frontend/dist',
    headers: [
      {
        source: '/(.*)',
        headers: [
          responseHeader('Content-Security-Policy', contentSecurityPolicy),
          responseHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'),
          responseHeader('X-Content-Type-Options', 'nosniff'),
          responseHeader('X-Frame-Options', 'DENY'),
          responseHeader('Referrer-Policy', 'strict-origin-when-cross-origin'),
          responseHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()'),
        ],
      },
    ],
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
  };
}

export const config = createVercelConfig(process.env);
