import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert, PortfolioMark, WatchSummary } from '../../types';
import { useAuthStore } from '../auth/authStore';
import { WatchesScreen } from './WatchesScreen';

const mark: PortfolioMark = { id: 'p1', firmId: 'f1', ownerUserId: 'u1', markText: 'FORGE GLOBAL', jurisdiction: 'US', niceClasses: [9], status: 'Registered', filingDate: '2020-01-01', renewalDate: '2030-01-01', sourceRegistry: 'USPTO' };
const watches: WatchSummary[] = [];
const alerts: Alert[] = [
  { id: 'older', watchId: 'w1', matchedFilingRef: 'EU1', riskScoreId: 'r2', riskResultId: '2', read: true, createdAt: '2026-08-01T22:00:00Z', matchedMarkText: 'FORTRESS', protectedMarkText: 'FORGE GLOBAL', severity: 'medium', source: 'EUIPO', supportingEvidence: ['Visual match'] },
  { id: 'newest', watchId: 'w1', matchedFilingRef: 'US1', riskScoreId: 'r1', riskResultId: '1', read: false, createdAt: '2026-08-04T08:00:00Z', matchedMarkText: 'FORGE LABS', protectedMarkText: 'FORGE GLOBAL', severity: 'high', source: 'USPTO', supportingEvidence: ['Phonetic match'] },
];
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const renderWatches = () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/v1/alerts') && init?.method === 'GET') return jsonResponse(alerts);
    if (url.endsWith('/api/v1/watches') && init?.method === 'GET') return jsonResponse(watches);
    if (url.endsWith('/api/v1/portfolio')) return jsonResponse([mark]);
    if (url.endsWith('/api/v1/watches') && init?.method === 'POST') return jsonResponse({ id: 'w-new', userId: 'u1', markText: mark.markText, jurisdiction: mark.jurisdiction, mocked: true, ...JSON.parse(String(init.body)) }, 201);
    return jsonResponse({}, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/watches']}><Routes><Route path="/watches" element={<WatchesScreen />} /><Route path="/search/risk/:id" element={<div>Risk destination</div>} /></Routes></MemoryRouter></QueryClientProvider>);
  return fetchMock;
};

describe('WatchesScreen', () => {
  beforeEach(() => useAuthStore.getState().setSession('watch-token', { id: 'u1', email: 'attorney@firm.com', fullName: 'Attorney', role: 'attorney' }));
  afterEach(() => { act(() => useAuthStore.getState().clearSession()); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('renders unread styling, newest-first ordering, filters, and risk navigation', async () => {
    renderWatches();
    const articles = await screen.findAllByRole('article');
    expect(articles[0]).toHaveAttribute('data-testid', 'alert-newest');
    expect(articles[0]).toHaveClass('bg-forge-teal-700/10');
    expect(within(articles[0]).getByText('Unread')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Severity' }), { target: { value: 'medium' } });
    expect(await screen.findByText('FORTRESS')).toBeVisible();
    expect(screen.queryByText('FORGE LABS')).not.toBeInTheDocument();
    const riskLink = screen.getByRole('link', { name: /Analyze risk/ });
    expect(riskLink).toHaveAttribute('href', '/search/risk/2?fromAlert=older');
    fireEvent.click(riskLink);
    expect(await screen.findByText('Risk destination')).toBeVisible();
  }, 20_000);

  it('validates and creates a watch without exposing SMS as a channel', async () => {
    const fetchMock = renderWatches();
    fireEvent.click(screen.getByRole('button', { name: 'Create new watch' }));
    expect(screen.queryByRole('option', { name: /SMS/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create watch' }));
    expect(await screen.findByText('Choose a portfolio mark.')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Portfolio mark' }), { target: { value: 'p1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Alert channel' }), { target: { value: 'in-app' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Alert mode' }), { target: { value: 'digest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create watch' }));
    expect(await screen.findByText(/FORGE GLOBAL watch created/i)).toBeVisible();
    const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ portfolioMarkId: 'p1', alertChannel: 'in-app', alertMode: 'digest', active: true });
  }, 20_000);

  it('supports keyboard watch creation', async () => {
    const user = userEvent.setup();
    renderWatches();
    const open = screen.getByRole('button', { name: 'Create new watch' });
    open.focus();
    await user.keyboard('{Enter}');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Portfolio mark' }), 'p1');
    const create = screen.getByRole('button', { name: 'Create watch' });
    create.focus();
    expect(create).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/FORGE GLOBAL watch created/i)).toBeVisible();
  }, 20_000);
});
