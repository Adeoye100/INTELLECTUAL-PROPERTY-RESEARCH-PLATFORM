import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockSearchResponse } from '../../lib/mocks/handlers';
import { SearchScreen } from './SearchScreen';

describe('SearchScreen source statuses', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the unavailable source seeded by the search mock', async () => {
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

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SearchScreen />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('Search mark name...'), {
      target: { value: 'FORGE' },
    });

    expect(await screen.findByText('WIPO: Unavailable')).toBeVisible();
    expect(screen.getByText('UKIPO: Pending')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(/results are partial/i);
  });
});
