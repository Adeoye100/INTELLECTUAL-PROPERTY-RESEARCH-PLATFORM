import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { LoginScreen } from './LoginScreen';

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const session = {
  access_token: 'supabase-token',
  user: {
    id: 'u1',
    email: 'attorney@example.test',
    email_confirmed_at: '2026-08-12T00:00:00Z',
    app_metadata: { application_role: 'attorney' },
    user_metadata: { full_name: 'Attorney User' },
  },
};

afterEach(() => {
  useAuthStore.getState().clearSession();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('LoginScreen', () => {
  it('supports keyboard sign-in and role-based navigation through Supabase', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session, user: session.user }, error: null });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        userId: 'u1', email: 'attorney@example.test', role: 'attorney', firmId: 'firm-1',
      }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })));
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/auth/login']}><Routes><Route path="/auth/login" element={<LoginScreen />} /><Route path="/portfolio" element={<h1>Attorney portfolio</h1>} /></Routes></MemoryRouter>);

    const email = screen.getByRole('textbox', { name: 'Email address' });
    email.focus();
    await user.keyboard('attorney@example.test');
    const password = screen.getByLabelText('Password');
    password.focus();
    await user.keyboard('safe-password');
    const submit = screen.getByRole('button', { name: 'Sign in' });
    submit.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Attorney portfolio' })).toBeVisible();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'attorney@example.test', password: 'safe-password' });
  }, 20_000);

  it('locally signs out an authenticated identity that has no firm membership', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session, user: session.user }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      userId: 'u1', email: 'attorney@example.test', role: null, firmId: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/auth/login']}><LoginScreen /></MemoryRouter>);

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'attorney@example.test');
    await user.type(screen.getByLabelText('Password'), 'safe-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/does not have an application role and firm membership/i)).toBeVisible();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('starts Google OAuth with the callback route', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://provider.test' }, error: null });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/auth/login']}><LoginScreen /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Google' }));

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: expect.stringMatching(/\/auth\/callback\?next=%2Fapp$/) },
    });
  });
});
