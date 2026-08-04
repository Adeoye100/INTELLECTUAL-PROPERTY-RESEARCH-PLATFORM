import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSearchResponse } from '../../lib/mocks/handlers';
import { useAuthStore } from '../auth/authStore';
import { SearchScreen } from './SearchScreen';

const renderSearch = (initialEntry = '/search') => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockSearchResponse,
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/search/risk/:id" element={<div>Risk detail destination</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, fetchMock };
};

describe('SearchScreen', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession('test-token', {
      id: 'search-user', email: 'search@firm.com', fullName: 'Search User', role: 'attorney',
    });
  });

  afterEach(() => {
    act(() => useAuthStore.getState().clearSession());
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends every submitted filter and renders ranked legal data with explicit source states', async () => {
    const { fetchMock } = renderSearch();

    fireEvent.change(screen.getByRole('textbox', { name: 'Mark' }), { target: { value: 'FORGE' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /European Union/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nice class' }), { target: { value: '9, 35' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'registered' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Owner' }), { target: { value: 'Forge Holdings' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2023-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2025-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search trademarks' }));

    await screen.findByRole('table', { name: /ranked by explicit risk/i });
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://example.test');
    expect(requestUrl.pathname).toBe('/api/search');
    expect(requestUrl.searchParams.get('mark')).toBe('FORGE');
    expect(requestUrl.searchParams.getAll('jurisdiction')).toEqual(['EU', 'US']);
    expect(requestUrl.searchParams.get('class')).toBe('9,35');
    expect(requestUrl.searchParams.get('status')).toBe('registered');
    expect(requestUrl.searchParams.get('owner')).toBe('Forge Holdings');
    expect(requestUrl.searchParams.get('filedFrom')).toBe('2023-01-01');
    expect(requestUrl.searchParams.get('filedTo')).toBe('2025-12-31');

    expect(screen.getByText(/USPTO: Complete/)).toBeVisible();
    expect(screen.getByText(/EUIPO: Pending/)).toBeVisible();
    expect(screen.getByText(/UKIPO: Delayed/)).toBeVisible();
    expect(screen.getByText(/WIPO: Unavailable/)).toBeVisible();
    const bodyRows = within(screen.getByRole('table', { name: /ranked by explicit risk/i })).getAllByRole('row').slice(1);
    expect(bodyRows[0]).toHaveTextContent('FORGE TEK');
    expect(bodyRows[0]).toHaveTextContent('high risk');
    expect(bodyRows[0]).toHaveTextContent('USPTO');
  }, 20_000);

  it('rejects an inverted filing-date range without making a request', async () => {
    const { fetchMock } = renderSearch();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-12-31' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search trademarks' }));

    expect(await screen.findByText('The end date must be on or after the start date.')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restores submitted filters for the same authenticated user', async () => {
    const first = renderSearch();
    fireEvent.change(screen.getByRole('textbox', { name: 'Mark' }), { target: { value: 'FORGE' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search trademarks' }));
    await screen.findByRole('table', { name: /ranked by explicit risk/i });
    first.unmount();

    renderSearch();
    expect(screen.getByRole('textbox', { name: 'Mark' })).toHaveValue('FORGE');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('pending');
    expect(await screen.findByRole('table', { name: /ranked by explicit risk/i })).toBeVisible();
  });

  it('supports keyboard submission, result selection, and review navigation', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.tab();
    const mark = screen.getByRole('textbox', { name: 'Mark' });
    expect(mark).toHaveFocus();
    await user.type(mark, 'FORGE');
    await user.tab();
    expect(screen.getByRole('checkbox', { name: /United States/ })).toHaveFocus();
    const submit = screen.getByRole('button', { name: 'Search trademarks' });
    submit.focus();
    expect(submit).toHaveFocus();
    await user.keyboard('{Enter}');
    await screen.findByRole('table', { name: /ranked by explicit risk/i });

    await waitFor(() => expect(submit).toBeEnabled());
    const firstSelection = screen.getByRole('checkbox', { name: 'Select FORGE TEK' });
    firstSelection.focus();
    expect(firstSelection).toHaveFocus();
    await user.keyboard(' ');
    expect(firstSelection).toBeChecked();
    const review = screen.getByRole('link', { name: 'Review risk for FORGE TEK' });
    review.focus();
    expect(review).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Risk detail destination')).toBeVisible();
  });

  it('has no automated accessibility violations before or after results load', async () => {
    const { container } = renderSearch();
    expect((await axe.run(container)).violations).toEqual([]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mark' }), { target: { value: 'FORGE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search trademarks' }));
    await screen.findByRole('table', { name: /ranked by explicit risk/i });
    expect((await axe.run(container)).violations).toEqual([]);
  }, 20_000);
});
