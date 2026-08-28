import { ApiError, getApiClient, type ApiRequestOptions } from '../../lib/api/client';
import { supabase } from '../../lib/supabase';

export type AuthErrorCode =
  | 'APPLICATION_USER_MISSING'
  | 'DUPLICATE_ACCOUNT'
  | 'EMAIL_NOT_VERIFIED'
  | 'EXPIRED_LINK'
  | 'FIRM_MEMBERSHIP_MISSING'
  | 'FIRM_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'NETWORK_ERROR'
  | 'PERMISSION_DENIED'
  | 'SEAT_LIMIT'
  | 'SESSION_EXPIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'STALE_SESSION'
  | 'UNKNOWN_ERROR';

export type AuthSyncStage = 'code-exchange' | 'provisioning' | 'resolve-current-user' | 'role-routing';

/** Deliberately contains only status, controlled codes, and public API origin. */
export interface AuthSynchronizationDiagnostic {
  stage: AuthSyncStage;
  status?: number;
  responseCode: AuthErrorCode | ApiError['code'];
  requestOrigin?: string;
}

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

export class AuthSynchronizationError extends AuthApiError {
  readonly diagnostic: AuthSynchronizationDiagnostic;

  constructor(
    code: AuthErrorCode,
    message: string,
    diagnostic: AuthSynchronizationDiagnostic,
  ) {
    super(code, message, diagnostic.status);
    this.name = 'AuthSynchronizationError';
    this.diagnostic = diagnostic;
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
    APPLICATION_USER_MISSING: 'Your account is authenticated, but it has not been added to an application firm yet. Ask a firm administrator for an invitation, then try again.',
    EMAIL_NOT_VERIFIED: 'Verify your email address before signing in. You can request another verification email below.',
    EXPIRED_LINK: 'This link has expired or has already been used. Request a new link to continue.',
    FIRM_MEMBERSHIP_MISSING: 'Your account is signed in, but it does not have an application role and firm membership yet. Ask a firm administrator for an invitation, then try again.',
    FIRM_ALREADY_EXISTS: 'This firm may already exist. Request an invitation from your firm administrator.',
    INVALID_CREDENTIALS: 'The email address or password is incorrect.',
    NETWORK_ERROR: 'We could not reach the service. Check your connection and try again.',
    PERMISSION_DENIED: 'You do not have permission to complete this action.',
    SEAT_LIMIT: 'Your firm has reached its licensed seat limit. Ask an administrator to free a seat or update the plan.',
    SESSION_EXPIRED: 'Your session expired. Sign in again to continue.',
    SERVICE_UNAVAILABLE: 'The application service is temporarily unavailable. Please try again shortly.',
    STALE_SESSION: 'Your sign-in state changed before it could be completed. Please try again.',
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

export function toAuthSynchronizationError(
  error: unknown,
  stage: AuthSyncStage,
): AuthSynchronizationError {
  if (error instanceof AuthSynchronizationError) return error;

  const apiError = error instanceof ApiError ? error : undefined;
  const status = apiError?.status;
  let code: AuthErrorCode;

  if (stage === 'resolve-current-user' && status === 404) {
    code = 'APPLICATION_USER_MISSING';
  } else if (stage === 'provisioning' && status === 409) {
    code = 'FIRM_ALREADY_EXISTS';
  } else if (status === 401) {
    code = 'SESSION_EXPIRED';
  } else if (status !== undefined && status >= 500) {
    code = 'SERVICE_UNAVAILABLE';
  } else if (apiError?.code === 'NETWORK_ERROR' || apiError?.code === 'TIMEOUT') {
    // Browsers intentionally expose CORS rejections and transport outages as
    // the same fetch failure. The diagnostic makes that limit explicit.
    code = 'NETWORK_ERROR';
  } else {
    code = toAuthApiError(error).code;
  }

  const diagnostic: AuthSynchronizationDiagnostic = {
    stage,
    responseCode: apiError?.code ?? code,
  };
  if (status !== undefined) diagnostic.status = status;
  if (apiError?.requestOrigin) diagnostic.requestOrigin = apiError.requestOrigin;
  return new AuthSynchronizationError(code, authErrorMessage(new AuthApiError(code, '')), diagnostic);
}
