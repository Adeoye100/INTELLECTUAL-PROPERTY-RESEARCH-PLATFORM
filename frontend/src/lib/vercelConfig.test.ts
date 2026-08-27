import { afterAll, describe, expect, it, vi } from 'vitest';

const originalEnvironment = vi.hoisted(() => {
  const keys = ['VITE_SUPABASE_URL', 'VITE_API_BASE_URL'] as const;
  const environment = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const original = Object.fromEntries(keys.map((key) => [key, environment[key]]));
  environment.VITE_SUPABASE_URL = 'https://ccslkfqnziikcsgbrwfd.supabase.co';
  environment.VITE_API_BASE_URL = 'https://iprp-api.onrender.com/api/v1';
  return original;
});

import { createVercelConfig } from '../../../vercel.ts';

const productionEnvironment = {
  VITE_SUPABASE_URL: 'https://ccslkfqnziikcsgbrwfd.supabase.co',
  VITE_API_BASE_URL: 'https://iprp-api.onrender.com/api/v1',
};

describe('Vercel response-header configuration', () => {
  it('serializes complete security headers for the production origins', () => {
    const configuration = createVercelConfig(productionEnvironment);

    expect(Array.isArray(configuration.headers)).toBe(true);
    for (const route of configuration.headers) {
      expect(route.source).toEqual(expect.any(String));
      expect(route.source.trim()).not.toBe('');
      for (const header of route.headers) {
        expect(header.key).toEqual(expect.any(String));
        expect(header.key.trim()).not.toBe('');
        expect(header.value).toEqual(expect.any(String));
        expect(header.value.trim()).not.toBe('');
      }
    }

    const serialized = JSON.parse(JSON.stringify(configuration)) as typeof configuration;
    expect(serialized.headers[0]?.headers).toEqual(configuration.headers[0]?.headers);

    const csp = configuration.headers[0]?.headers[0];
    expect(csp).toEqual(expect.objectContaining({ key: 'Content-Security-Policy' }));
    expect(csp?.value).toContain("default-src 'self'");
    expect(csp?.value).toContain("frame-ancestors 'none'");
    expect(csp?.value).toContain('https://ccslkfqnziikcsgbrwfd.supabase.co');
    expect(csp?.value).toContain('https://iprp-api.onrender.com');
    expect(csp?.value).not.toContain("'unsafe-eval'");
    expect(csp?.value).not.toMatch(/\*|localhost/i);
  });

  it('fails with a controlled error before constructing a malformed header', () => {
    expect(() => createVercelConfig({
      VITE_API_BASE_URL: productionEnvironment.VITE_API_BASE_URL,
    })).toThrow('VITE_SUPABASE_URL');
    expect(() => createVercelConfig({
      VITE_SUPABASE_URL: productionEnvironment.VITE_SUPABASE_URL,
    })).toThrow('VITE_API_BASE_URL');
  });

  it('does not serialize backend-only secret references into frontend configuration', () => {
    const serialized = JSON.stringify(createVercelConfig(productionEnvironment));

    expect(serialized).not.toMatch(/secret|service.*role|database/i);
  });
});

afterAll(() => {
  const environment = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete environment[key];
    } else {
      environment[key] = value;
    }
  }
});
