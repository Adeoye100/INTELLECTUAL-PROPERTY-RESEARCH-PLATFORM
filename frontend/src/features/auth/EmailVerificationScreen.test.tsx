import { render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationScreen } from './EmailVerificationScreen';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const renderVerification = (entry: string) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/auth/verify-email" element={<EmailVerificationScreen />} />
      <Route path="/auth/verify-email/:token" element={<EmailVerificationScreen />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EmailVerificationScreen', () => {
  it('shows and focuses the verified state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ verified: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderVerification('/auth/verify-email/valid-token');

    await screen.findByRole('heading', { name: 'Email verified' });
    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Email verified' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute('href', '/auth/login');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/auth/verify-email/valid-token');
  });

  it('shows the pending verification state without issuing a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderVerification('/auth/verify-email?email=pending%40example.test');

    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(screen.getByText(/pending@example\.test/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('shows the expired verification-link state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'EXPIRED_LINK',
      message: 'Verification link expired.',
    }, 410)));
    renderVerification('/auth/verify-email/expired-token');

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Verification link expired' })).toBeVisible();
    expect(screen.getByText(/expired or has already been used/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send a new verification email' })).toBeEnabled();
  });

  it('shows the generic invalid-link state without calling it expired', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'INVALID_LINK',
      message: 'Verification token is invalid.',
    }, 400)));
    renderVerification('/auth/verify-email/invalid-token');

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Verification failed' })).toBeVisible();
    expect(screen.getByText('Verification token is invalid.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /expired/i })).not.toBeInTheDocument();
  });
});
