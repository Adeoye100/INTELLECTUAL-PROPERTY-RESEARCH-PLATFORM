import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InviteAcceptanceScreen } from './InviteAcceptanceScreen';

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signUp: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));

const renderInvitation = (token: string) => render(
  <MemoryRouter initialEntries={[`/auth/invite/${token}`]}>
    <Routes><Route path="/auth/invite/:token" element={<InviteAcceptanceScreen />} /></Routes>
  </MemoryRouter>,
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  auth.signInWithPassword.mockReset();
  auth.signUp.mockReset();
});

describe('InviteAcceptanceScreen', () => {
  it('shows a helpful expired-invitation state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'EXPIRED_LINK', message: 'Invitation expired.',
    }), { status: 410, headers: { 'Content-Type': 'application/json' } })));
    renderInvitation('expired');

    expect(await screen.findByRole('heading', { name: 'Invitation expired' })).toBeVisible();
    expect(screen.getByText(/expired or has already been used/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /ask your administrator/i })).toBeVisible();
  });

  it('recovers from a network error and exposes a logical keyboard order', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: 'new@firm.com', firmName: 'Forge Legal Partners', role: 'attorney',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    renderInvitation('network-retry');

    const errorState = await screen.findByRole('alert');
    await waitFor(() => expect(errorState).toHaveFocus());
    const retry = screen.getByRole('button', { name: 'Retry invitation' });
    await user.tab();
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');

    const name = await screen.findByRole('textbox', { name: 'Full name' });
    expect(name).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Create password')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Confirm password')).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 20_000);

  it('keeps backend acceptance and establishes the resulting Supabase session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: 'viewer-invite@invite.example', firmName: 'Forge Legal Partners', role: 'viewer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), {
        status: 201, headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    auth.signUp.mockResolvedValue({
      data: {
        user: { id: 'supabase-user', identities: [{}] },
        session: {
          access_token: 'supabase-access-token',
          user: {
            id: 'supabase-user', email: 'viewer-invite@invite.example', email_confirmed_at: '2026-08-12T00:00:00Z',
            app_metadata: {}, user_metadata: { full_name: 'Invited User', onboarding_required: true },
          },
        },
      },
      error: null,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/auth/invite/viewer-invite']}>
        <Routes>
          <Route path="/auth/invite/:token" element={<InviteAcceptanceScreen />} />
          <Route path="/dashboard" element={<h1>Onboarding dashboard</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(await screen.findByRole('textbox', { name: 'Full name' }), 'Invited User');
    await user.type(screen.getByLabelText('Create password'), 'safe-password');
    await user.type(screen.getByLabelText('Confirm password'), 'safe-password');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(await screen.findByRole('heading', { name: 'Onboarding dashboard' })).toBeVisible();
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'viewer-invite@invite.example', password: 'safe-password',
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ fullName: 'Invited User' });
  }, 20_000);
});
