// Keep this file type-checkable with the frontend's browser-oriented TypeScript
// project; Vercel provides the real Node `process` object at config-build time.
declare const process: { env: Record<string, string | undefined> };

function requiredOrigin(name: string) {
  const value = process.env[name]?.trim();
  if (!value || /your[-_]|placeholder|replace[-_]?me|change[-_]?me|\.invalid|<[^>]+>/i.test(value)) {
    throw new Error(`${name} must be a configured non-placeholder HTTPS origin before a Vercel build.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error(`${name} must be an HTTPS origin without credentials, query, fragment, or path.`);
  }
  return url.origin;
}

function requiredApiOrigin() {
  const value = process.env.VITE_API_BASE_URL?.trim();
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

const supabaseOrigin = requiredOrigin('VITE_SUPABASE_URL');
const apiOrigin = requiredApiOrigin();
const csp = [
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

export const config = {
  framework: 'vite',
  installCommand: 'corepack enable && cd frontend && pnpm install --frozen-lockfile',
  buildCommand: 'cd frontend && pnpm run build',
  outputDirectory: 'frontend/dist',
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()' },
      ],
    },
  ],
  rewrites: [{ source: '/(.*)', destination: '/index.html' }],
};
