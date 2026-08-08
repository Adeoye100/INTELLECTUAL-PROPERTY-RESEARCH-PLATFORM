export type ApiMode = 'live' | 'mock' | 'demo';

export interface ApiEnvironment {
  VITE_API_BASE_URL?: string;
  VITE_API_MODE?: string;
  VITE_ALLOW_DEMO_BUILD?: string;
}

export interface ApiConfig {
  baseUrl: string;
  mode: ApiMode;
}

const API_VERSION_PATH = '/api/v1';

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export function resolveApiConfig(
  environment: ApiEnvironment,
  runtime: { isDevelopment: boolean },
): ApiConfig {
  const requestedMode = environment.VITE_API_MODE?.trim() || 'live';
  if (requestedMode !== 'live' && requestedMode !== 'mock' && requestedMode !== 'demo') {
    throw new Error('VITE_API_MODE must be one of: "live", "mock", or "demo".');
  }

  if (requestedMode === 'mock' && !runtime.isDevelopment) {
    throw new Error('VITE_API_MODE=mock is allowed only by a Vite development build.');
  }

  if (requestedMode === 'demo') {
    const allowDemo = environment.VITE_ALLOW_DEMO_BUILD === 'true';
    if (!allowDemo) {
      throw new Error('VITE_API_MODE=demo requires VITE_ALLOW_DEMO_BUILD=true.');
    }
  }

  const configuredBaseUrl = environment.VITE_API_BASE_URL?.trim();
  const baseUrl = normalizeBaseUrl(configuredBaseUrl || (requestedMode !== 'live' ? API_VERSION_PATH : ''));
  if (!baseUrl) {
    throw new Error('VITE_API_BASE_URL is required when VITE_API_MODE is live.');
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl, 'http://frontend.invalid');
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute URL or a root-relative path.');
  }
  const isRootRelative = baseUrl.startsWith('/') && !baseUrl.startsWith('//');
  const isAbsoluteHttp = /^https?:\/\//i.test(baseUrl);
  if (!isRootRelative && !isAbsoluteHttp) {
    throw new Error('VITE_API_BASE_URL must be an HTTP(S) URL or a root-relative path.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VITE_API_BASE_URL cannot contain credentials, a query, or a fragment.');
  }
  if (!parsed.pathname.endsWith(API_VERSION_PATH)) {
    throw new Error(`VITE_API_BASE_URL must end with the documented ${API_VERSION_PATH} base path.`);
  }
  if (!runtime.isDevelopment && isAbsoluteHttp && parsed.protocol !== 'https:') {
    throw new Error('Absolute VITE_API_BASE_URL values must use HTTPS outside development.');
  }

  return Object.freeze({ baseUrl, mode: requestedMode });
}

let runtimeConfig: ApiConfig | undefined;

export function getApiConfig(): ApiConfig {
  runtimeConfig ??= resolveApiConfig({
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_API_MODE: import.meta.env.VITE_API_MODE,
    VITE_ALLOW_DEMO_BUILD: import.meta.env.VITE_ALLOW_DEMO_BUILD,
  }, { isDevelopment: import.meta.env.DEV });
  return runtimeConfig;
}

export const shouldEnableMocking = (config: ApiConfig) => config.mode === 'mock' || config.mode === 'demo';
