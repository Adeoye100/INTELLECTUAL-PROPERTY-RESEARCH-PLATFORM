import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncSupabaseSession, useAuthStore } from './authStore';

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const session = {
  access_token: 'fresh-supabase-token',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'attorney@example.test',
    email_confirmed_at: '2026-08-12T00:00:00Z',
    user_metadata: { full_name: 'Attorney User' },
  },
};

afterEach(() => {
  useAuthStore.getState().clearSession();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('syncSupabaseSession', () => {
  it('uses one centralized /me request to establish the authoritative role and firm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      userId: session.user.id,
      email: session.user.email,
      role: 'attorney',
      firmId: '22222222-2222-4222-8222-222222222222',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncSupabaseSession(session as never)).resolves.toMatchObject({
      id: session.user.id,
      role: 'attorney',
      firmId: '22222222-2222-4222-8222-222222222222',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/me');
    expect(String(fetchMock.mock.calls[0][0])).not.toMatch(/\/(?:admin|attorney|viewer)\/ping/);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer fresh-supabase-token');
  });

  it('deduplicates concurrent restoration and auth-state synchronization for one session', async () => {
    let resolveResponse: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = syncSupabaseSession(session as never);
    const second = syncSupabaseSession(session as never);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    resolveResponse!(new Response(JSON.stringify({
      userId: session.user.id,
      email: session.user.email,
      role: 'attorney',
      firmId: '22222222-2222-4222-8222-222222222222',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it('does not restore a session after that session has been cleared', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const synchronization = syncSupabaseSession(session as never);
    useAuthStore.getState().clearSession();

    await expect(synchronization).rejects.toThrow('A newer authentication state replaced this session.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});
