export type ApiMode = 'live' | 'mock';

export interface ApiEnvironment {
  VITE_API_BASE_URL?: string;
  VITE_API_MODE?: string;
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
  if (requestedMode !== 'live' && requestedMode !== 'mock') {
    throw new Error('VITE_API_MODE must be either "live" or "mock".');
  }
  if (requestedMode === 'mock' && !runtime.isDevelopment) {
    throw new Error('VITE_API_MODE=mock is allowed only by a Vite development build.');
  }

  const configuredBaseUrl = environment.VITE_API_BASE_URL?.trim();
  const baseUrl = normalizeBaseUrl(configuredBaseUrl || (requestedMode === 'mock' ? API_VERSION_PATH : ''));
  if (!baseUrl) {
    throw new Error('VITE_API_BASE_URL is required when VITE_API_MODE is live.');
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl, 'http://frontend.invalid');
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute URL or a root-relative path.');
  }
  if (!baseUrl.startsWith('/') && !/^https?:\/\//i.test(baseUrl)) {
    throw new Error('VITE_API_BASE_URL must be an HTTP(S) URL or a root-relative path.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VITE_API_BASE_URL cannot contain credentials, a query, or a fragment.');
  }
  if (!parsed.pathname.endsWith(API_VERSION_PATH)) {
    throw new Error(`VITE_API_BASE_URL must end with the documented ${API_VERSION_PATH} base path.`);
  }

  return Object.freeze({ baseUrl, mode: requestedMode });
}

let runtimeConfig: ApiConfig | undefined;

export function getApiConfig(): ApiConfig {
  runtimeConfig ??= resolveApiConfig(import.meta.env, { isDevelopment: import.meta.env.DEV });
  return runtimeConfig;
}

export const shouldEnableMocking = (config: ApiConfig) => config.mode === 'mock';
