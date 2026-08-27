import { afterEach, describe, expect, it, vi } from 'vitest';
import { authErrorMessage, authRequest, toAuthApiError } from './authApi';
import { ApiError } from '../../lib/api/client';

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('authRequest logout', () => {
  it('signs out through Supabase without calling the legacy backend route', async () => {
    auth.signOut.mockResolvedValue({ error: null });
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(authRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a protected API 401 to the session-expired state', () => {
    expect(toAuthApiError({ status: 401, message: 'Access token is invalid or expired.' })).toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
    });
  });

  it('retains an allowlisted provisioning error code without rendering its server message', () => {
    const error = toAuthApiError(new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'The request could not be completed.',
      serverCode: 'FIRM_ALREADY_EXISTS',
      status: 409,
    }));
    expect(error).toMatchObject({ code: 'FIRM_ALREADY_EXISTS', status: 409 });
    expect(authErrorMessage(error)).toBe('This firm may already exist. Request an invitation from your firm administrator.');
  });
});
