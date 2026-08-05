import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { LoginScreen } from './LoginScreen';

afterEach(() => {
  useAuthStore.getState().clearSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LoginScreen', () => {
  it('supports keyboard sign-in and role-based navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: 'token',
      expiresAt: Date.now() + 60_000,
      user: { id: 'u1', email: 'attorney@example.test', fullName: 'Attorney User', role: 'attorney' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/auth/login']}><Routes><Route path="/auth/login" element={<LoginScreen />} /><Route path="/dashboard" element={<h1>Dashboard destination</h1>} /></Routes></MemoryRouter>);

    const email = screen.getByRole('textbox', { name: 'Email address' });
    email.focus();
    await user.keyboard('attorney@example.test');
    const password = screen.getByLabelText('Password');
    password.focus();
    await user.keyboard('safe-password');
    const submit = screen.getByRole('button', { name: 'Sign in' });
    submit.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Dashboard destination' })).toBeVisible();
  }, 20_000);
});
