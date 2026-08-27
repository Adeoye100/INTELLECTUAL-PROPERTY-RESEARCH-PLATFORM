import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuthCallbackScreen } from './OAuthCallbackScreen';
import { useAuthStore } from './authStore';

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), getSession: vi.fn(), signOut: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  useAuthStore.getState().clearSession();
});

describe('OAuthCallbackScreen', () => {
  it('exchanges the PKCE code and routes the user into the app', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      userId: 'u1', email: 'admin@example.test', role: 'admin', firmId: 'firm-1',
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
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

    expect(await screen.findByRole('heading', { name: 'Admin destination' })).toBeVisible();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
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
});
