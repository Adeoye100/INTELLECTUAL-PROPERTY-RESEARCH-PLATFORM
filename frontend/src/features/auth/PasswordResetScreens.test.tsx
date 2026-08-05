import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordResetRequestScreen, PasswordUpdateScreen } from './PasswordResetScreens';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

function LoginDestination() {
  const location = useLocation();
  return <p>Login destination: {(location.state as { reason?: string } | null)?.reason}</p>;
}

const renderResetRequest = () => render(
  <MemoryRouter initialEntries={['/auth/forgot-password']}>
    <Routes><Route path="/auth/forgot-password" element={<PasswordResetRequestScreen />} /></Routes>
  </MemoryRouter>,
);

const renderPasswordUpdate = (token = 'valid-token') => render(
  <MemoryRouter initialEntries={[`/auth/reset-password/${token}`]}>
    <Routes>
      <Route path="/auth/reset-password/:token" element={<PasswordUpdateScreen />} />
      <Route path="/auth/login" element={<LoginDestination />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PasswordResetScreens', () => {
  it('uses account-safe messaging after a reset request succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepted: true }, 202));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderResetRequest();

    const email = screen.getByRole('textbox', { name: 'Email address' });
    expect(email).toHaveFocus();
    await user.type(email, 'person@example.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    const success = await screen.findByRole('status');
    await waitFor(() => expect(success).toHaveFocus());
    expect(success).toHaveTextContent(/if an account exists for person@example\.test/i);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ email: 'person@example.test' });
  }, 20_000);

  it('updates a password and navigates to the password-updated sign-in state', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'POST' ? new Response(null, { status: 204 }) : jsonResponse({ valid: true })
    ));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPasswordUpdate();

    const password = await screen.findByLabelText('New password');
    await user.type(password, 'updated-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'updated-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('Login destination: password-updated')).toBeVisible();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ password: 'updated-password' });
  }, 20_000);

  it('reports password validation failures accessibly without submitting', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ valid: true }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { container } = renderPasswordUpdate();

    await user.type(await screen.findByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    const submit = screen.getByRole('button', { name: 'Update password' });
    submit.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Password must be at least 8 characters.')).toHaveAttribute('id', 'new-password-error');
    expect(screen.getByText('Passwords do not match.')).toHaveAttribute('id', 'confirm-new-password-error');
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-describedby', 'new-password-error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await axe.run(container)).violations).toEqual([]);
  }, 20_000);

  it('shows the expired-link state returned by validation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'EXPIRED_LINK',
      message: 'Reset link expired.',
    }, 410)));
    renderPasswordUpdate('expired-token');

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Reset link expired' })).toBeVisible();
    expect(screen.getByText(/expired or has already been used/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute('href', '/auth/forgot-password');
  });
});
