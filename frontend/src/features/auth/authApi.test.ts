import { afterEach, describe, expect, it, vi } from 'vitest';
import { authRequest } from './authApi';

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
});
