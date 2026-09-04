import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuthCallbackScreen } from './OAuthCallbackScreen';
import { getLastAuthSynchronizationDiagnostic, useAuthStore } from './authStore';

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), getSession: vi.fn(), signOut: vi.fn(), signInWithOAuth: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useAuthStore.getState().clearSession();
});

describe('OAuthCallbackScreen', () => {
  it('does not apply the landing boot gate and exchanges the PKCE code before requesting /me', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      userId: 'u1', email: 'admin@example.test', role: 'admin', firmId: 'firm-1',
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    auth.exchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'oauth-token',
          user: {
            id: 'u1', email: 'admin@example.test', email_confirmed_at: '2026-08-12T00:00:00Z',
            app_metadata: { application_role: 'admin' }, user_metadata: { full_name: 'Admin User' },
          },
        },
      },
      error: null,
    });
    render(
      <MemoryRouter initialEntries={['/auth/callback?code=pkce-code&next=%2Fadmin']}>
        <Routes>
          <Route path="/auth/callback" element={<OAuthCallbackScreen />} />
          <Route path="/admin" element={<h1>Admin destination</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Preparing Forge Global…')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Admin destination' })).toBeVisible();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/me');
    expect(replaceState).toHaveBeenCalledWith(null, document.title, window.location.pathname);
    expect(String(replaceState.mock.calls.at(-1)?.[2])).not.toContain('code=');
  });

  it('focuses an accessible error state when code exchange fails', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: 'OAuth code invalid' } });
    auth.signOut.mockResolvedValue({ error: null });
    render(<MemoryRouter initialEntries={['/auth/callback?code=bad-code']}><OAuthCallbackScreen /></MemoryRouter>);

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Could not complete sign in' })).toBeVisible();
    expect(screen.queryByText('OAuth code invalid')).toBeNull();
  });

  it('classifies a /me CORS or network failure without clearing an established session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: {
        access_token: 'oauth-token', user: { id: 'u1', email: 'admin@example.test', user_metadata: {} },
      } }, error: null,
    });

    render(<MemoryRouter initialEntries={['/auth/callback?code=network-code']}><OAuthCallbackScreen /></MemoryRouter>);

    expect(await screen.findByText('We could not reach the service. Check your connection and try again.')).toBeVisible();
    expect(getLastAuthSynchronizationDiagnostic()).toEqual(expect.objectContaining({
      stage: 'resolve-current-user', responseCode: 'NETWORK_ERROR', requestOrigin: expect.any(String),
    }));
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('records a rejected JWT response before signing out locally', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })));
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: {
        access_token: 'oauth-token', user: { id: 'u1', email: 'admin@example.test', user_metadata: {} },
      } }, error: null,
    });
    auth.signOut.mockResolvedValue({ error: null });

    render(<MemoryRouter initialEntries={['/auth/callback?code=jwt-code']}><OAuthCallbackScreen /></MemoryRouter>);

    expect(await screen.findByText('Your session expired. Sign in again to continue.')).toBeVisible();
    expect(getLastAuthSynchronizationDiagnostic()).toEqual(expect.objectContaining({
      stage: 'resolve-current-user', status: 401, responseCode: 'UNAUTHORIZED', requestOrigin: expect.any(String),
    }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
  });

  it('maps a missing application user to a controlled retryable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'USER_NOT_FOUND', message: 'database connection details',
    }), { status: 404, headers: { 'Content-Type': 'application/json' } })));
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: {
        access_token: 'oauth-token', user: { id: 'u1', email: 'admin@example.test', user_metadata: {} },
      } }, error: null,
    });

    render(<MemoryRouter initialEntries={['/auth/callback?code=missing-user']}><OAuthCallbackScreen /></MemoryRouter>);

    expect(await screen.findByText(/has not been added to an application firm/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText(/database connection details/i)).toBeNull();
    expect(getLastAuthSynchronizationDiagnostic()).toEqual(expect.objectContaining({
      stage: 'resolve-current-user', status: 404, responseCode: 'NOT_FOUND', requestOrigin: expect.any(String),
    }));
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('reports a missing role or firm without rendering server details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      userId: 'u1', email: 'admin@example.test', role: null, firmId: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: {
        access_token: 'oauth-token', user: { id: 'u1', email: 'admin@example.test', user_metadata: {} },
      } }, error: null,
    });

    render(<MemoryRouter initialEntries={['/auth/callback?code=missing-role']}><OAuthCallbackScreen /></MemoryRouter>);

    expect(await screen.findByText(/does not have an application role and firm membership/i)).toBeVisible();
    expect(getLastAuthSynchronizationDiagnostic()).toEqual({
      stage: 'role-routing', responseCode: 'FIRM_MEMBERSHIP_MISSING',
    });
  });

  it('deduplicates a PKCE exchange across Strict Mode callback execution', async () => {
    let resolveExchange!: (value: unknown) => void;
    auth.exchangeCodeForSession.mockImplementation(() => new Promise((resolve) => { resolveExchange = resolve; }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      userId: 'u1', email: 'admin@example.test', role: 'admin', firmId: 'firm-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <StrictMode><MemoryRouter initialEntries={['/auth/callback?code=duplicate-code']}>
        <Routes><Route path="/auth/callback" element={<OAuthCallbackScreen />} /><Route path="/admin/users" element={<h1>Admin users destination</h1>} /></Routes>
      </MemoryRouter></StrictMode>,
    );
    await waitFor(() => expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce());
    resolveExchange({
      data: { session: {
        access_token: 'oauth-token', user: { id: 'u1', email: 'admin@example.test', user_metadata: {} },
      } }, error: null,
    });
    await screen.findByRole('heading', { name: 'Admin users destination' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
  });

  it('uses an established session when a PKCE code was already consumed', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null }, error: { code: 'flow_state_not_found', message: 'Code already exchanged' },
    });
    auth.getSession.mockResolvedValue({
      data: { session: {
        access_token: 'oauth-token', user: { id: 'u1', email: 'admin@example.test', user_metadata: {} },
      } }, error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      userId: 'u1', email: 'admin@example.test', role: 'admin', firmId: 'firm-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    render(
      <MemoryRouter initialEntries={['/auth/callback?code=consumed-code']}>
        <Routes><Route path="/auth/callback" element={<OAuthCallbackScreen />} /><Route path="/admin/users" element={<h1>Admin users destination</h1>} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Admin users destination' })).toBeVisible();
    expect(auth.getSession).toHaveBeenCalledOnce();
  });

  it('starts a fresh OAuth flow from Try again instead of reusing the callback code', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null }, error: { code: 'USER_NOT_FOUND', message: 'application user missing' },
    });
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: null });
    render(<MemoryRouter initialEntries={['/auth/callback?code=single-use-code&next=%2Fdashboard']}><OAuthCallbackScreen /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledOnce());
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      options: expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback?next=%2Fdashboard') }),
    }));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
  });
});
