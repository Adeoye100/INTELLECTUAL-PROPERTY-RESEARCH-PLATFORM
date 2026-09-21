import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeFeatureBoundary } from './RuntimeFeatureBoundary';
import { useRuntimeCapabilities } from './runtimeCapabilities';

vi.mock('./runtimeCapabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runtimeCapabilities')>();
  return { ...actual, useRuntimeCapabilities: vi.fn() };
});

const capabilityResult = (status: 'available' | 'blocked' | 'disabled') => ({
  data: { features: { officeActions: { status, reason: null } } },
  isLoading: false,
  isError: false,
});

const renderBoundary = () => render(
  <MemoryRouter>
    <RuntimeFeatureBoundary
      feature="officeActions"
      blockedTitle="Office Actions blocked"
      blockedDetail="Corpus unavailable"
      inactiveFallback={<div>Manual verified-reference workflow</div>}
    >
      <div>Automated corpus search</div>
    </RuntimeFeatureBoundary>
  </MemoryRouter>,
);

describe('RuntimeFeatureBoundary inactive fallback', () => {
  beforeEach(() => vi.mocked(useRuntimeCapabilities).mockReset());

  it('renders the full feature when the runtime capability is available', () => {
    vi.mocked(useRuntimeCapabilities).mockReturnValue(capabilityResult('available') as ReturnType<typeof useRuntimeCapabilities>);
    renderBoundary();
    expect(screen.getByText('Automated corpus search')).toBeVisible();
    expect(screen.queryByText('Manual verified-reference workflow')).not.toBeInTheDocument();
  });

  it.each(['blocked', 'disabled'] as const)('renders the safe fallback when the capability is %s', (status) => {
    vi.mocked(useRuntimeCapabilities).mockReturnValue(capabilityResult(status) as ReturnType<typeof useRuntimeCapabilities>);
    renderBoundary();
    expect(screen.getByText('Manual verified-reference workflow')).toBeVisible();
    expect(screen.queryByText('Automated corpus search')).not.toBeInTheDocument();
  });
});
