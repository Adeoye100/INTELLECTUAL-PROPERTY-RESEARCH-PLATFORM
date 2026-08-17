import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const renderPortfolio = () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/v1/portfolio') && init?.method === 'GET') return jsonResponse(marks);
    if (url.endsWith('/api/v1/watches')) return jsonResponse([watch]);
    if (url.includes('/api/v1/portfolio/p2/watch')) return jsonResponse({ ...watch, id: 'w2', portfolioMarkId: 'p2', markText: 'INNOVATE PRO', jurisdiction: 'EU' }, 201);
    return jsonResponse({}, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/portfolio']}><Routes><Route path="/portfolio" element={<PortfolioScreen />} /><Route path="/portfolio/:markId" element={<div>Portfolio detail destination</div>} /></Routes></MemoryRouter></QueryClientProvider>);
  return fetchMock;
};

describe('PortfolioScreen', () => {
  beforeEach(() => useAuthStore.getState().setSession('portfolio-token', { id: 'u1', email: 'attorney@firm.com', fullName: 'Attorney', role: 'attorney', firmId: 'firm-1' }));
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
    expect(String(request?.[0])).toContain('/api/v1/portfolio/p2/watch');
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ alertChannel: 'email', alertMode: 'real-time', active: true });
  }, 20_000);

  it('preserves active filters when navigating to mark detail', async () => {
    renderPortfolio();
    await screen.findByText('INNOVATE PRO');
    fireEvent.change(screen.getByRole('combobox', { name: 'Jurisdiction' }), { target: { value: 'EU' } });
    fireEvent.click(screen.getByRole('link', { name: 'Details' }));
    expect(await screen.findByText('Portfolio detail destination')).toBeVisible();
  });

  it('supports keyboard filtering and detail navigation', async () => {
    const user = userEvent.setup();
    renderPortfolio();
    await screen.findByText('INNOVATE PRO');
    const jurisdiction = screen.getByRole('combobox', { name: 'Jurisdiction' });
    jurisdiction.focus();
    await user.selectOptions(jurisdiction, 'EU');
    const details = screen.getByRole('link', { name: 'Details' });
    details.focus();
    expect(details).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Portfolio detail destination')).toBeVisible();
  });
});
