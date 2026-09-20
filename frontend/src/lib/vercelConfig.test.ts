import { describe, expect, it } from 'vitest';
import configurationJson from '../../vercel.json';

interface VercelHeader { key: string; value: string }
interface VercelHeaderRule {
  source: string;
  has?: Array<{ type: string; value: string }>;
  headers: VercelHeader[];
}
interface VercelConfig {
  framework: string;
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  headers: VercelHeaderRule[];
  rewrites: Array<{ source: string; destination: string }>;
}

const configuration = configurationJson as VercelConfig;
const headerMap = (rule: VercelHeaderRule | undefined) =>
  Object.fromEntries(rule?.headers.map(({ key, value }) => [key, value]) ?? []);
const ruleForHost = (host: string) =>
  configuration.headers.find((rule) => rule.has?.some((condition) => condition.type === 'host' && condition.value === host));

describe('Vercel production configuration', () => {
  it('uses the Vercel-recognized frontend-root deployment contract', () => {
    expect(configuration.framework).toBe('vite');
    expect(configuration.installCommand).toBe('corepack enable && pnpm install --frozen-lockfile');
    expect(configuration.buildCommand).toBe('pnpm run build');
    expect(configuration.outputDirectory).toBe('dist');
    expect(configuration.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('defines a complete production security-header policy', () => {
    const commonHeaders = headerMap(configuration.headers.find((rule) => !rule.has));
    const productionHeaders = headerMap(ruleForHost('fgiprp.com'));
    const csp = productionHeaders['Content-Security-Policy'];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://ccslkfqnziikcsgbrwfd.supabase.co');
    expect(csp).toContain('https://iprp-api.onrender.com');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/\*|localhost/i);
    expect(commonHeaders['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(commonHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(commonHeaders['X-Frame-Options']).toBe('DENY');
    expect(commonHeaders['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(commonHeaders['Permissions-Policy']).toContain('camera=()');
  });

  it('allows environment-specific HTTPS connections only on protected previews', () => {
    const previewHeaders = headerMap(ruleForHost('.*\\.vercel\\.app'));
    const previewCsp = previewHeaders['Content-Security-Policy'];

    expect(previewCsp).toContain("default-src 'self'");
    expect(previewCsp).toContain("frame-ancestors 'none'");
    expect(previewCsp).toContain("connect-src 'self' https:");
    expect(previewCsp).not.toContain("'unsafe-eval'");
  });

  it('does not reference backend-only configuration or secrets', () => {
    expect(JSON.stringify(configuration)).not.toMatch(/service.*role|database|redis|elastic|paystack|secret/i);
  });
});
