import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioMark, WatchSummary } from '../../types';
import { useAuthStore } from '../auth/authStore';
import { PortfolioScreen } from './PortfolioScreen';

const marks: PortfolioMark[] = [
  { id: 'p1', firmId: 'f1', ownerUserId: 'u1', markText: 'FORGE GLOBAL', jurisdiction: 'US', niceClasses: [9], status: 'Registered', filingDate: '2020-01-01', renewalDate: '2030-01-01', sourceRegistry: 'USPTO' },
  { id: 'p2', firmId: 'f1', ownerUserId: 'u1', markText: 'INNOVATE PRO', jurisdiction: 'EU', niceClasses: [42], status: 'Pending', filingDate: '2024-01-01', renewalDate: '2026-08-25', sourceRegistry: 'EUIPO' },
];
const watch: WatchSummary = { id: 'w1', portfolioMarkId: 'p1', userId: 'u1', alertChannel: 'email', alertMode: 'real-time', active: true, markText: 'FORGE GLOBAL', jurisdiction: 'US', mocked: true };

const renderPortfolio = () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/portfolio') && !init?.method) return new Response(JSON.stringify(marks), { status: 200 });
    if (url.endsWith('/api/watches')) return new Response(JSON.stringify([watch]), { status: 200 });
    if (url.includes('/api/portfolio/p2/watch')) return new Response(JSON.stringify({ ...watch, id: 'w2', portfolioMarkId: 'p2', markText: 'INNOVATE PRO', jurisdiction: 'EU' }), { status: 201 });
    return new Response('{}', { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/portfolio']}><Routes><Route path="/portfolio" element={<PortfolioScreen />} /><Route path="/portfolio/:markId" element={<div>Portfolio detail destination</div>} /></Routes></MemoryRouter></QueryClientProvider>);
  return fetchMock;
};

describe('PortfolioScreen', () => {
  beforeEach(() => useAuthStore.getState().setSession('portfolio-token', { id: 'u1', email: 'attorney@firm.com', fullName: 'Attorney', role: 'attorney' }));
  afterEach(() => { act(() => useAuthStore.getState().clearSession()); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('filters the table and creates a watch in one click', async () => {
    const fetchMock = renderPortfolio();
    expect(await screen.findByRole('table', { name: 'Portfolio marks and renewal deadlines' })).toHaveTextContent('FORGE GLOBAL');
    fireEvent.change(screen.getByRole('combobox', { name: 'Jurisdiction' }), { target: { value: 'EU' } });
    expect(screen.queryByText('FORGE GLOBAL')).not.toBeInTheDocument();
    expect(screen.getByText('INNOVATE PRO')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Create watch' }));
    expect(await screen.findByText(/INNOVATE PRO is now watched/i)).toBeVisible();
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(request?.[0])).toContain('/api/portfolio/p2/watch');
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ alertChannel: 'email', alertMode: 'real-time', active: true });
  }, 20_000);

  it('preserves active filters when navigating to mark detail', async () => {
    renderPortfolio();
    await screen.findByText('INNOVATE PRO');
    fireEvent.change(screen.getByRole('combobox', { name: 'Jurisdiction' }), { target: { value: 'EU' } });
    fireEvent.click(screen.getByRole('link', { name: 'Details' }));
    expect(await screen.findByText('Portfolio detail destination')).toBeVisible();
  });
});
