import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockSearchResponse } from '../../lib/mocks/handlers';
import { SearchScreen } from './SearchScreen';

const renderSearch = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSearchResponse,
    })
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/search']}>
        <Routes>
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/search/risk/:id" element={<div>Risk detail destination</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('SearchScreen accessibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the unavailable source seeded by the search mock', async () => {
    renderSearch();

    fireEvent.change(screen.getByPlaceholderText('Search mark name...'), {
      target: { value: 'FORGE' },
    });

    expect(await screen.findByText('WIPO: Unavailable')).toBeVisible();
    expect(screen.getByText('UKIPO: Pending')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(/results are partial/i);
  }, 20_000);

  it('has no automated axe violations before or after results load', async () => {
    const { container } = renderSearch();

    expect((await axe.run(container)).violations).toEqual([]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Mark Text' }), {
      target: { value: 'FORGE' },
    });
    await screen.findByText('WIPO: Unavailable');

    expect((await axe.run(container)).violations).toEqual([]);
  }, 20_000);

  it('supports a logical tab order and native keyboard activation through results review', async () => {
    const user = userEvent.setup();
    const submitSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    renderSearch();

    await user.tab();
    const queryInput = screen.getByRole('textbox', { name: 'Mark Text' });
    expect(queryInput).toHaveFocus();
    await user.type(queryInput, 'FORGE');

    const reviewLinks = await screen.findAllByRole('link', { name: 'Review Risk' });
    const jurisdictionNames = [
      'United States (USPTO)',
      'European Union (EUIPO)',
      'United Kingdom (UKIPO)',
      'Canada (CIPO)',
      'Australia (IP Australia)',
    ];

    for (const name of jurisdictionNames) {
      await user.tab();
      expect(screen.getByRole('checkbox', { name })).toHaveFocus();
    }

    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Nice Classes' })).toHaveFocus();

    await user.tab();
    const applyButton = screen.getByRole('button', { name: 'Apply Filters' });
    expect(applyButton).toHaveFocus();
    await user.keyboard(' ');
    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith(
        'Search filters:',
        expect.objectContaining({ query: 'FORGE' })
      );
    });

    await user.tab();
    expect(reviewLinks[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Risk detail destination')).toBeVisible();
  }, 20_000);
});
