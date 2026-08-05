import { ApiError, getApiClient, type ApiRequestOptions } from '../../lib/api/client';

export type AuthErrorCode =
  | 'DUPLICATE_ACCOUNT'
  | 'EMAIL_NOT_VERIFIED'
  | 'EXPIRED_LINK'
  | 'INVALID_CREDENTIALS'
  | 'NETWORK_ERROR'
  | 'PERMISSION_DENIED'
  | 'SEAT_LIMIT'
  | 'SESSION_EXPIRED'
  | 'UNKNOWN_ERROR';

export class AuthApiError extends Error {
  readonly code: AuthErrorCode;
  readonly status?: number;

  constructor(
    code: AuthErrorCode,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.status = status;
  }
}

export async function authRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const path = String(input);
  try {
    let body: unknown;
    if (typeof init?.body === 'string' && init.body) body = JSON.parse(init.body);
    const options: ApiRequestOptions = {
      method: init?.method as ApiRequestOptions['method'],
      headers: init?.headers,
      signal: init?.signal ?? undefined,
      body,
    };
    return await getApiClient().requestJson<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw new AuthApiError('UNKNOWN_ERROR', 'The request could not be completed. Please try again.');
    }
    const knownServerCode = error.serverCode && [
      'DUPLICATE_ACCOUNT', 'EMAIL_NOT_VERIFIED', 'EXPIRED_LINK', 'INVALID_CREDENTIALS',
      'PERMISSION_DENIED', 'SEAT_LIMIT', 'SESSION_EXPIRED',
    ].includes(error.serverCode) ? error.serverCode as AuthErrorCode : undefined;
    const fallbackCode: AuthErrorCode = error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT'
      ? 'NETWORK_ERROR'
      : error.status === 401
        ? useSessionErrorCode(path)
        : error.status === 403
          ? 'PERMISSION_DENIED'
          : 'UNKNOWN_ERROR';
    throw new AuthApiError(knownServerCode ?? fallbackCode, error.message, error.status);
  }
}

const useSessionErrorCode = (path: string): AuthErrorCode =>
  path === '/auth/login' ? 'INVALID_CREDENTIALS' : 'SESSION_EXPIRED';

export const authErrorMessage = (error: unknown): string => {
  if (!(error instanceof AuthApiError)) return 'Something went wrong. Please try again.';
  const messages: Record<AuthErrorCode, string> = {
    DUPLICATE_ACCOUNT: 'An account already exists for this email address. Sign in or reset your password instead.',
    EMAIL_NOT_VERIFIED: 'Verify your email address before signing in. You can request another verification email below.',
    EXPIRED_LINK: 'This link has expired or has already been used. Request a new link to continue.',
    INVALID_CREDENTIALS: 'The email address or password is incorrect.',
    NETWORK_ERROR: 'We could not reach the service. Check your connection and try again.',
    PERMISSION_DENIED: 'You do not have permission to complete this action.',
    SEAT_LIMIT: 'Your firm has reached its licensed seat limit. Ask an administrator to free a seat or update the plan.',
    SESSION_EXPIRED: 'Your session expired. Sign in again to continue.',
    UNKNOWN_ERROR: error.message || 'The request could not be completed. Please try again.',
  };
  return messages[error.code];
};
