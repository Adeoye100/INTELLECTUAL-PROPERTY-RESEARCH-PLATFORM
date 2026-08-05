import { describe, expect, it } from 'vitest';
import { resolveApiConfig, shouldEnableMocking } from './config';

describe('API mode selection', () => {
  it('defaults staging and production-style builds to live mode', () => {
    const config = resolveApiConfig(
      { VITE_API_BASE_URL: 'https://staging.example.test/api/v1' },
      { isDevelopment: false },
    );

    expect(config).toEqual({
      baseUrl: 'https://staging.example.test/api/v1',
      mode: 'live',
    });
    expect(shouldEnableMocking(config)).toBe(false);
  });

  it('enables MSW only when mock mode is explicit in development', () => {
    const config = resolveApiConfig({ VITE_API_MODE: 'mock' }, { isDevelopment: true });

    expect(config).toEqual({ baseUrl: '/api/v1', mode: 'mock' });
    expect(shouldEnableMocking(config)).toBe(true);
  });

  it('rejects mock mode outside development', () => {
    expect(() => resolveApiConfig(
      { VITE_API_MODE: 'mock', VITE_API_BASE_URL: '/api/v1' },
      { isDevelopment: false },
    )).toThrow(/allowed only.*development/i);
  });

  it('requires a live base URL with the documented version path', () => {
    expect(() => resolveApiConfig({}, { isDevelopment: true })).toThrow(/VITE_API_BASE_URL is required/i);
    expect(() => resolveApiConfig(
      { VITE_API_BASE_URL: 'https://api.example.test/api' },
      { isDevelopment: false },
    )).toThrow(/must end.*\/api\/v1/i);
    expect(() => resolveApiConfig(
      { VITE_API_BASE_URL: '//unexpected.example.test/api/v1' },
      { isDevelopment: false },
    )).toThrow(/HTTP\(S\).*root-relative/i);
    expect(() => resolveApiConfig(
      { VITE_API_BASE_URL: 'http://api.example.test/api/v1' },
      { isDevelopment: false },
    )).toThrow(/must use HTTPS/i);
  });
});
