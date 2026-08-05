import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDashboardSummary, mockSearchResponse } from '../../lib/mocks/handlers';
import { DashboardScreen } from '../dashboard/DashboardScreen';
import { SearchScreen } from '../search/SearchScreen';
import { useAuthStore } from '../auth/authStore';
import { useOnboardingStore } from './onboardingStore';

const renderFlow = (initialEntry = '/dashboard') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/search" element={<SearchScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('FE-06 onboarding flow', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession('new-user-token', {
      id: 'new-user', email: 'new@firm.com', fullName: 'New Attorney', role: 'attorney',
      emailVerified: true, onboardingRequired: true,
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/v1/search')) return new Response(JSON.stringify(mockSearchResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/api/v1/dashboard/summary')) return new Response(JSON.stringify(mockDashboardSummary), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });

  afterEach(() => {
    act(() => {
      useAuthStore.getState().clearSession();
      useOnboardingStore.setState({ progressByUser: {} });
    });
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('persists successful first-search onboarding and skips the checklist afterwards', async () => {
    const user = userEvent.setup();
    renderFlow();
    expect(screen.getByRole('heading', { name: 'Complete one useful action' })).toBeVisible();

    await user.click(screen.getByRole('link', { name: /run your first search/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Mark' }), { target: { value: 'FORGE' } });
    await user.click(screen.getByRole('button', { name: 'Search trademarks' }));
    await screen.findByText(/WIPO: Unavailable/);

    expect(await screen.findByText(/first search completed on this browser/i)).toBeVisible();
    expect(useOnboardingStore.getState().progressByUser['new-user']).toMatchObject({
      source: 'client-device', completedPath: 'search',
    });
    expect(localStorage.getItem('forge-client-onboarding-v1')).toContain('client-device');

    await user.click(screen.getByRole('link', { name: 'Continue to dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Console Overview' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Complete one useful action' })).not.toBeInTheDocument();
  }, 30_000);

  it('keeps incomplete local progress visible without marking server activity complete', () => {
    useOnboardingStore.getState().selectPath('new-user', 'portfolio');
    renderFlow();

    expect(screen.getByRole('heading', { name: 'Complete one useful action' })).toBeVisible();
    expect(screen.getByText('0 of 1 complete')).toBeVisible();
    expect(useOnboardingStore.getState().progressByUser['new-user']).toMatchObject({
      source: 'client-device', selectedPath: 'portfolio', completedPath: null,
    });
    expect(screen.getByText(/browser progress only/i)).toBeVisible();
  });
});
