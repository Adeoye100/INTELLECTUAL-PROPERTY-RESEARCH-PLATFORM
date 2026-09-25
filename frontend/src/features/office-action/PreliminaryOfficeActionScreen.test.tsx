import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore';
import { PreliminaryOfficeActionScreen } from './PreliminaryOfficeActionScreen';

function renderScreen(role: 'admin' | 'attorney' | 'viewer') {
  act(() => useAuthStore.getState().setSession('test-token', {
    id: 'u1', email: `${role}@example.test`, fullName: role, role, firmId: 'firm-1',
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PreliminaryOfficeActionScreen /></MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  act(() => useAuthStore.getState().clearSession());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PreliminaryOfficeActionScreen permissions', () => {
  it('keeps manual Office Action intake read-only for a viewer', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderScreen('viewer');

    expect(screen.getByText('View-only access').closest('[role="note"]')).toHaveTextContent(/Attorney or Admin must add/i);
    expect(screen.queryByRole('heading', { name: /add verified office action reference/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save reference/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
