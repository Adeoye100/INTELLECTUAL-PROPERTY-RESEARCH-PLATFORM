import { useAuthStore } from '../../features/auth/authStore';
import { getApiConfig, type ApiConfig } from './config';

export const SESSION_EXPIRED_EVENT = 'forge:session-expired';

export type ApiErrorCode =
  | 'ABORTED'
  | 'FORBIDDEN'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly serverCode?: string;
  readonly requestOrigin?: string;

  constructor(options: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    requestId?: string;
    serverCode?: string;
    requestOrigin?: string;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.serverCode = options.serverCode;
    this.requestOrigin = options.requestOrigin;
  }
}

interface ErrorPayload {
  code?: string;
  message?: string;
  requestId?: string;
}

export interface ApiRequestOptions {
  body?: unknown;
  headers?: HeadersInit;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  signal?: AbortSignal;
  // Session establishment needs to classify a rejected bootstrap request
  // before a global unauthorized handler clears the local projection.
  suppressUnauthorizedHandler?: boolean;
  timeoutMs?: number;
}

export interface ApiBlobResponse {
  blob: Blob;
  headers: Headers;
  status: number;
}

interface ApiClientDependencies {
  config: ApiConfig;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
  timeoutMs?: number;
}

const codeForStatus = (status: number): ApiErrorCode => {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400 || status === 409 || status === 422) return 'VALIDATION_ERROR';
  if (status >= 500) return 'SERVER_ERROR';
  return 'HTTP_ERROR';
};

const defaultMessageForStatus = (status: number) => {
  if (status === 401) return 'Your session is no longer valid. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to complete this request.';
  if (status === 404) return 'The requested resource was not found.';
  if (status >= 500) return 'The service is temporarily unavailable. Please try again.';
  return 'The request could not be completed.';
};

const isJsonContentType = (value: string | null) =>
  Boolean(value && /(?:application\/json|\+json)(?:;|$)/i.test(value));

async function readErrorPayload(response: Response): Promise<ErrorPayload> {
  try {
    if (isJsonContentType(response.headers.get('content-type'))) {
      const payload = await response.json();
      return payload && typeof payload === 'object' ? payload as ErrorPayload : {};
    }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/plain')) return {};
    const message = (await response.text()).trim();
    return message ? { message } : {};
  } catch {
    return {};
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken: () => string | null;
  private readonly onUnauthorized: () => void;
  private readonly timeoutMs: number;

  constructor({
    config,
    fetchImpl = (input, init) => globalThis.fetch(input, init),
    getAccessToken = () => null,
    onUnauthorized = () => undefined,
    timeoutMs = 15_000,
  }: ApiClientDependencies) {
    this.baseUrl = config.baseUrl;
    this.fetchImpl = fetchImpl;
    this.getAccessToken = getAccessToken;
    this.onUnauthorized = onUnauthorized;
    this.timeoutMs = timeoutMs;
  }

  async requestJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const response = await this.execute(path, options);
    if (response.status === 204) return undefined as T;
    if (!isJsonContentType(response.headers.get('content-type'))) {
      throw new ApiError({
        code: 'INVALID_RESPONSE',
        message: 'The service returned an unexpected response format.',
        status: response.status,
        requestId: response.headers.get('x-request-id') ?? undefined,
        requestOrigin: this.requestOrigin(),
      });
    }
    try {
      return await response.json() as T;
    } catch {
      throw new ApiError({
        code: 'INVALID_RESPONSE',
        message: 'The service returned invalid JSON.',
        status: response.status,
        requestId: response.headers.get('x-request-id') ?? undefined,
        requestOrigin: this.requestOrigin(),
      });
    }
  }

  async requestBlob(path: string, options: ApiRequestOptions = {}): Promise<ApiBlobResponse> {
    const response = await this.execute(path, options);
    return { blob: await response.blob(), headers: response.headers, status: response.status };
  }

  private async execute(path: string, options: ApiRequestOptions): Promise<Response> {
    if (!path.startsWith('/') || path.startsWith('/api/')) {
      throw new Error('API request paths must be root-relative to the configured /api/v1 base URL.');
    }

    const controller = new AbortController();
    const requestOrigin = this.requestOrigin();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? this.timeoutMs);
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (options.signal?.aborted) abortFromCaller();

    const token = this.getAccessToken();
    const headers = new Headers(options.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    // Bootstrap requests such as GET /me run before the Zustand projection is
    // populated, so callers may supply the freshly issued Supabase token.
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        // Authentication is a bearer header for the configured API origin;
        // cross-origin cookies are never needed or sent.
        credentials: 'omit',
        signal: controller.signal,
      });

      if (!response.ok) {
        if (
          response.status === 401
          && !options.suppressUnauthorizedHandler
          && (token || headers.has('Authorization'))
        ) this.onUnauthorized();
        const payload = await readErrorPayload(response);
        throw new ApiError({
          code: codeForStatus(response.status),
          // The browser cannot establish that an upstream message is safe or
          // audience-appropriate. Keep server codes/request IDs for support,
          // but render only this controlled local message.
          message: defaultMessageForStatus(response.status),
          status: response.status,
          requestId: payload.requestId || response.headers.get('x-request-id') || undefined,
          serverCode: payload.code,
          requestOrigin,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (timedOut) {
        throw new ApiError({
          code: 'TIMEOUT', message: 'The request timed out. Please try again.', requestOrigin,
        });
      }
      if (options.signal?.aborted) {
        throw new ApiError({ code: 'ABORTED', message: 'The request was cancelled.', requestOrigin });
      }
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: 'We could not reach the service. Check your connection and try again.',
        requestOrigin,
      });
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private requestOrigin() {
    return new URL(this.baseUrl, window.location.origin).origin;
  }
}

let runtimeClient: ApiClient | undefined;

export function getApiClient(): ApiClient {
  runtimeClient ??= new ApiClient({
    config: getApiConfig(),
    getAccessToken: () => useAuthStore.getState().token,
    onUnauthorized: () => {
      useAuthStore.getState().clearSession();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    },
  });
  return runtimeClient;
}
