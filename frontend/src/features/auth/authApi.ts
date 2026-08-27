import { ApiError, getApiClient, type ApiRequestOptions } from '../../lib/api/client';
import { supabase } from '../../lib/supabase';

export type AuthErrorCode =
  | 'DUPLICATE_ACCOUNT'
  | 'EMAIL_NOT_VERIFIED'
  | 'EXPIRED_LINK'
  | 'FIRM_ALREADY_EXISTS'
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
  if (path === '/auth/logout') {
    const { error } = await supabase.auth.signOut();
    if (error) throw toAuthApiError(error);
    return undefined as T;
  }
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
      'DUPLICATE_ACCOUNT', 'EMAIL_NOT_VERIFIED', 'EXPIRED_LINK', 'FIRM_ALREADY_EXISTS', 'INVALID_CREDENTIALS',
      'PERMISSION_DENIED', 'SEAT_LIMIT', 'SESSION_EXPIRED',
    ].includes(error.serverCode) ? error.serverCode as AuthErrorCode : undefined;
    const fallbackCode: AuthErrorCode = error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT'
      ? 'NETWORK_ERROR'
      : error.status === 401
        ? sessionErrorCode(path)
        : error.status === 403
          ? 'PERMISSION_DENIED'
          : 'UNKNOWN_ERROR';
    throw new AuthApiError(knownServerCode ?? fallbackCode, error.message, error.status);
  }
}

const sessionErrorCode = (path: string): AuthErrorCode =>
  path === '/auth/login' ? 'INVALID_CREDENTIALS' : 'SESSION_EXPIRED';

export const authErrorMessage = (error: unknown): string => {
  if (!(error instanceof AuthApiError)) return 'Something went wrong. Please try again.';
  const messages: Record<AuthErrorCode, string> = {
    DUPLICATE_ACCOUNT: 'An account already exists for this email address. Sign in or reset your password instead.',
    EMAIL_NOT_VERIFIED: 'Verify your email address before signing in. You can request another verification email below.',
    EXPIRED_LINK: 'This link has expired or has already been used. Request a new link to continue.',
    FIRM_ALREADY_EXISTS: 'This firm may already exist. Request an invitation from your firm administrator.',
    INVALID_CREDENTIALS: 'The email address or password is incorrect.',
    NETWORK_ERROR: 'We could not reach the service. Check your connection and try again.',
    PERMISSION_DENIED: 'You do not have permission to complete this action.',
    SEAT_LIMIT: 'Your firm has reached its licensed seat limit. Ask an administrator to free a seat or update the plan.',
    SESSION_EXPIRED: 'Your session expired. Sign in again to continue.',
    UNKNOWN_ERROR: 'The request could not be completed. Please try again.',
  };
  return messages[error.code];
};

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
}

export function toAuthApiError(error: unknown): AuthApiError {
  if (error instanceof AuthApiError) return error;
  const candidate = error && typeof error === 'object' ? error as SupabaseErrorLike : {};
  const serverCode = error instanceof ApiError ? error.serverCode : candidate.code;
  const detail = `${candidate.code ?? ''} ${candidate.name ?? ''} ${candidate.message ?? ''}`.toLowerCase();

  if (/fetch|network|offline|retryable/.test(detail) || candidate.status === 0) {
    return new AuthApiError('NETWORK_ERROR', 'The authentication service could not be reached.', candidate.status);
  }
  if (/email[_ ]?not[_ ]?confirmed|email[_ ]?not[_ ]?verified/.test(detail)) {
    return new AuthApiError('EMAIL_NOT_VERIFIED', 'Email verification is required.', candidate.status);
  }
  if (/invalid[_ ]?credentials|invalid login credentials/.test(detail)) {
    return new AuthApiError('INVALID_CREDENTIALS', 'Invalid credentials.', candidate.status);
  }
  if (serverCode === 'FIRM_ALREADY_EXISTS') {
    return new AuthApiError('FIRM_ALREADY_EXISTS', 'This firm may already exist.', candidate.status);
  }
  if (/already[_ ]?(?:registered|exists)|identity_already_exists|user_already_exists/.test(detail)) {
    return new AuthApiError('DUPLICATE_ACCOUNT', 'An account already exists.', candidate.status);
  }
  if (candidate.status === 401) {
    return new AuthApiError('SESSION_EXPIRED', 'Your session expired. Sign in again.', candidate.status);
  }
  if (/expired|otp_expired|flow_state_not_found/.test(detail)) {
    return new AuthApiError('EXPIRED_LINK', 'The link has expired.', candidate.status);
  }
  return new AuthApiError(
    'UNKNOWN_ERROR',
    'The request could not be completed. Please try again.',
    candidate.status,
  );
}
