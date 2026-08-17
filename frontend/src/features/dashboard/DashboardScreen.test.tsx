import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDashboardSummary } from '../../lib/mocks/handlers';
import { useAuthStore } from '../auth/authStore';
import { DashboardScreen } from './DashboardScreen';

const renderDashboard = (response = mockDashboardSummary, ok = true) => {
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

  it('places unresolved High-risk legal alerts before aggregate dashboard metrics', async () => {
    renderDashboard();
    const urgent = await screen.findByRole('heading', { name: 'Unresolved High-risk alerts' }, { timeout: 5_000 });
    const metrics = screen.getByRole('region', { name: 'Firm summary metrics' });
    expect(urgent.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Unresolved High-risk trademark alerts' })).toHaveTextContent('US99887766');
    expect(screen.getByRole('table', { name: 'Recent trademark searches' })).toHaveTextContent('FORGE');
  }, 15_000);

  it('announces partial data and retries without hiding available sections', async () => {
    const fetchMock = renderDashboard({
      ...mockDashboardSummary,
      partial: true,
      unavailableSections: ['EUIPO alerts'],
    });
    expect(await screen.findByText('Dashboard data is partial')).toBeVisible();
    expect(screen.getByText(/EUIPO alerts/)).toBeVisible();
    expect(screen.getByText('Active watches')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry missing data' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('offers retry when the dashboard request fails', async () => {
    const fetchMock = renderDashboard(mockDashboardSummary, false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Dashboard unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
