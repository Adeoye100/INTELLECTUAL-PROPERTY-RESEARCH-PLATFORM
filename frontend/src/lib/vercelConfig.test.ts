import { describe, expect, it } from 'vitest';
import configurationJson from '../../vercel.json';

interface VercelHeader { key: string; value: string }
interface VercelConfig {
  framework: string;
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  headers: Array<{ source: string; headers: VercelHeader[] }>;
  rewrites: Array<{ source: string; destination: string }>;
}

const configuration = configurationJson as VercelConfig;

describe('Vercel production configuration', () => {
  it('uses the Vercel-recognized frontend-root deployment contract', () => {
    expect(configuration.framework).toBe('vite');
    expect(configuration.installCommand).toBe('corepack enable && pnpm install --frozen-lockfile');
    expect(configuration.buildCommand).toBe('pnpm run build');
    expect(configuration.outputDirectory).toBe('dist');
    expect(configuration.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('defines a complete production security-header policy', () => {
    const headers = Object.fromEntries(configuration.headers[0]?.headers.map(({ key, value }) => [key, value]) ?? []);

    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).toContain('https://ccslkfqnziikcsgbrwfd.supabase.co');
    expect(headers['Content-Security-Policy']).toContain('https://iprp-api.onrender.com');
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-eval'");
    expect(headers['Content-Security-Policy']).not.toMatch(/\*|localhost/i);
    expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
  });

  it('does not reference backend-only configuration or secrets', () => {
    expect(JSON.stringify(configuration)).not.toMatch(/service.*role|database|redis|elastic|paystack|secret/i);
  });
});
