import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardAnalytics } from '../../types';
import { useAuthStore } from '../auth/authStore';
import { DashboardScreen } from './DashboardScreen';

const mockAnalytics: DashboardAnalytics = {
  generatedAt: '2026-08-04T12:00:00.000Z',
  cacheStatus: 'miss',
  range: '30d',
  portfolio: {
    total: 24,
    byRisk: [
      { risk: 'low', count: 18 },
      { risk: 'medium', count: 4 },
      { risk: 'high', count: 2 },
    ],
    byStatus: [
      { status: 'registered', count: 20 },
      { status: 'pending', count: 4 },
    ],
    renewalsDueSoon: 2,
  },
  watchActivity: {
    points: [
      { date: '2026-08-01', polls: 5, alerts: 1, partial: 0, unavailable: 0 },
      { date: '2026-08-02', polls: 6, alerts: 0, partial: 0, unavailable: 0 },
    ],
    enabled: 12,
    disabled: 2,
  },
};

const renderDashboard = (response = mockAnalytics, ok = true) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><DashboardScreen /></MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
};

describe('DashboardScreen data states', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession('dashboard-token', {
      id: 'dashboard-user', email: 'dashboard@firm.com', fullName: 'Dashboard User',
      role: 'attorney', firmId: 'firm-1', onboardingRequired: false,
    });
  });

  afterEach(() => {
    act(() => useAuthStore.getState().clearSession());
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders portfolio analytics and allows switching range filters', async () => {
    const fetchMock = renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Console Overview' })).toBeVisible();
    expect(await screen.findByText('Total marks')).toBeVisible();
    expect(screen.getByText('Renewals due soon')).toBeVisible();

    const range7d = screen.getByRole('button', { name: '7d' });
    fireEvent.click(range7d);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/dashboard/analytics?range=7d'),
        expect.anything(),
      );
    });
  });

  it('offers retry when the dashboard request fails', async () => {
    const fetchMock = renderDashboard(mockAnalytics, false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Dashboard unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('renders unassessed risk as a neutral row without mapping to low', async () => {
    const analyticsWithUnknown: DashboardAnalytics = {
      ...mockAnalytics,
      portfolio: {
        ...mockAnalytics.portfolio,
        byRisk: [
          ...mockAnalytics.portfolio.byRisk,
          { risk: 'unknown', count: 5 },
        ],
      },
    };
    renderDashboard(analyticsWithUnknown);
    expect(await screen.findByText('Total marks')).toBeVisible();
    expect(screen.getByText('Unassessed')).toBeVisible();
    expect(screen.getByText('Unassessed risk')).toBeVisible();
  });
});
