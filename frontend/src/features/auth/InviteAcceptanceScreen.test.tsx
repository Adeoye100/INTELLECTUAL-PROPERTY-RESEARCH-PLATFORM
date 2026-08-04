import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InviteAcceptanceScreen } from './InviteAcceptanceScreen';

const renderInvitation = (token: string) => render(
  <MemoryRouter initialEntries={[`/auth/invite/${token}`]}>
    <Routes><Route path="/auth/invite/:token" element={<InviteAcceptanceScreen />} /></Routes>
  </MemoryRouter>,
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

    const retry = await screen.findByRole('button', { name: 'Retry invitation' });
    retry.focus();
    await user.keyboard('{Enter}');

    const name = await screen.findByRole('textbox', { name: 'Full name' });
    expect(name).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Create password')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Confirm password')).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 20_000);
});
