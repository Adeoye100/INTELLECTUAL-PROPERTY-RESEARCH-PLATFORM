import { render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationScreen } from './EmailVerificationScreen';

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), resend: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const renderVerification = (entry: string) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/auth/verify-email" element={<EmailVerificationScreen />} />
      <Route path="/auth/verify-email/:token" element={<EmailVerificationScreen />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('EmailVerificationScreen', () => {
  it('exchanges the Supabase confirmation code and focuses the verified state', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { id: 'local-user', firmId: 'firm-1', email: 'confirmed@example.test', role: 'admin' },
        firm: { id: 'firm-1', name: 'Forge Legal', subscriptionTier: 'free' },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })));
    auth.exchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'confirmed-token',
          user: {
            id: 'u1', email: 'confirmed@example.test', email_confirmed_at: '2026-08-12T00:00:00Z',
            app_metadata: {}, user_metadata: {
              full_name: 'Confirmed User', forge_signup_firm_name: 'Forge Legal',
            },
          },
        },
      },
      error: null,
    });
    renderVerification('/auth/verify-email?code=valid-code');

    await screen.findByRole('heading', { name: 'Email verified' });
    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveFocus());
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('valid-code');
    expect(fetch).toHaveBeenCalledWith('/api/v1/provisioning/firm', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ firmName: 'Forge Legal' }),
    }));
    expect(screen.getByRole('link', { name: 'Continue to the app' })).toHaveAttribute('href', '/app');
  });

  it('shows the pending verification state accessibly without an auth call', async () => {
    const { container } = renderVerification('/auth/verify-email?email=pending%40example.test');

    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(screen.getByText(/pending@example\.test/)).toBeVisible();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('resends confirmation through Supabase', async () => {
    auth.resend.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    renderVerification('/auth/verify-email?email=pending%40example.test');

    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(await screen.findByText('A new verification email was sent.')).toBeVisible();
    expect(auth.resend).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: 'pending@example.test' }));
  });

  it('shows the expired Supabase confirmation-link state', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { code: 'otp_expired', message: 'Confirmation expired' } });
    renderVerification('/auth/verify-email?code=expired-code&email=pending%40example.test');

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'Verification link expired' })).toBeVisible();
  });
});
