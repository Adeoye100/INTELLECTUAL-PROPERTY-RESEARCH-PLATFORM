import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetRequestScreen, PasswordUpdateScreen } from './PasswordResetScreens';

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

function LoginDestination() {
  const location = useLocation();
  return <p>Login destination: {(location.state as { reason?: string } | null)?.reason}</p>;
}

const renderResetRequest = () => render(<MemoryRouter><PasswordResetRequestScreen /></MemoryRouter>);
const renderPasswordUpdate = (entry = '/auth/reset-password?code=valid-code') => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/auth/reset-password" element={<PasswordUpdateScreen />} />
      <Route path="/auth/reset-password/:token" element={<PasswordUpdateScreen />} />
      <Route path="/auth/login" element={<LoginDestination />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => vi.clearAllMocks());

describe('PasswordResetScreens', () => {
  it('uses account-safe messaging after Supabase sends a reset request', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    renderResetRequest();

    const email = screen.getByRole('textbox', { name: 'Email address' });
    expect(email).toHaveFocus();
    await user.type(email, 'person@example.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    const success = await screen.findByRole('status');
    await waitFor(() => expect(success).toHaveFocus());
    expect(success).toHaveTextContent(/if an account exists for person@example\.test/i);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('person@example.test', {
      redirectTo: expect.stringMatching(/\/auth\/reset-password$/),
    });
  });

  it('exchanges the recovery code, updates the password, and signs out', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderPasswordUpdate();

    await user.type(await screen.findByLabelText('New password'), 'updated-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'updated-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('Login destination: password-updated')).toBeVisible();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('valid-code');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'updated-password' });
  });

  it('reports password validation failures accessibly without updating', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    const user = userEvent.setup();
    const { container } = renderPasswordUpdate();

    await user.type(await screen.findByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    const submit = screen.getByRole('button', { name: 'Update password' });
    submit.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Password must be at least 8 characters.')).toHaveAttribute('id', 'new-password-error');
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-describedby', 'new-password-error');
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect((await axe.run(container)).violations).toEqual([]);
  }, 20_000);

  it('shows an expired Supabase recovery-link state', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { code: 'otp_expired', message: 'Recovery code expired' } });
    renderPasswordUpdate('/auth/reset-password/expired-code');

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Reset link expired' })).toBeVisible();
  });
});
