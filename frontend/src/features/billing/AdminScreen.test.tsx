import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore';
import { AdminScreen } from './AdminScreen';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const summary = {
  subscription: { tier: 'starter', status: 'active', provider: 'paystack', renewsAt: null },
  plans: [{ tier: 'starter', amountSubunit: 250_000, currency: 'NGN' }, { tier: 'professional', amountSubunit: 750_000, currency: 'NGN' }],
  transactions: [{
    id: 'tx-1', reference: 'iprp_0123456789abcdef0123456789abcdef', tier: 'starter',
    amountSubunit: 250_000, currency: 'NGN', status: 'success', paidAt: '2026-09-01T12:00:00.000Z',
  }],
};

describe('AdminScreen billing', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession('admin-token', {
      id: 'u1', email: 'admin@forgeglobal.com', fullName: 'Jane Smith', role: 'admin', firmId: 'firm-1',
    });
  });

  afterEach(() => {
    act(() => useAuthStore.getState().clearSession());
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders server-owned subscription state and transaction history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(summary));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><AdminScreen /></MemoryRouter>);

    expect(await screen.findByText('starter', { selector: 'p' })).toBeVisible();
    expect(screen.getByText('active')).toBeVisible();
    expect(screen.getByText('iprp_0123456789abcdef0123456789abcdef')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/billing', expect.objectContaining({
      credentials: 'omit',
      headers: expect.any(Headers),
    }));
    expect((fetchMock.mock.calls[0][1].headers as Headers).get('Authorization')).toBe('Bearer admin-token');
  });

  it('verifies a callback reference on the backend and removes it from browser history', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(summary));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter initialEntries={['/admin/billing?reference=iprp_callback']}><AdminScreen /></MemoryRouter>);

    expect(await screen.findByText('Payment verified and subscription activated.')).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const verifyCall = fetchMock.mock.calls.find(([input]) => input === '/api/v1/billing/verify');
    expect(verifyCall?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(verifyCall?.[1]?.body))).toEqual({ reference: 'iprp_callback' });
  });

  it('rejects an unexpected checkout origin before browser navigation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ subscription: null, transactions: [], plans: summary.plans }))
      .mockResolvedValueOnce(json({ authorizationUrl: 'https://attacker.example/checkout' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><AdminScreen /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Choose starter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Checkout could not be started');
  });
});
