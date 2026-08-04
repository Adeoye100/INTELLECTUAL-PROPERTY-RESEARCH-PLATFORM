/**
 * RiskDetailScreen.test.tsx
 *
 * Covers:
 *  - Role permissions: admin/attorney see Save/Research/Discard; viewer sees only Export
 *  - Derived risk content rendered from route state
 *  - Direct refresh fallback (no route state → API query fires)
 *  - Matter save success and error paths
 *  - Discard confirmation flow
 *  - Keyboard interaction on action panel
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { RiskDetailScreen } from './RiskDetailScreen';
import { matterAdapter } from './matterAdapter';
import { useAuthStore } from '../auth/authStore';
import type { RiskDetailRouteState, SearchResult, RiskScore, Matter } from '../../types';

// ---------------------------------------------------------------------------
// Use the real persisted auth store so this file cannot leak a module mock into
// dashboard and search tests when Vitest schedules files in the same worker.
// ---------------------------------------------------------------------------

const setMockRole = (role: 'admin' | 'attorney' | 'viewer') => {
  useAuthStore.getState().setSession('risk-detail-test-token', {
    id: 'risk-detail-user',
    email: 'risk-detail@firm.com',
    fullName: 'Risk Detail User',
    role,
  });
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockScore: RiskScore = {
  id: 'r1',
  phoneticScore: 85,
  visualScore: 70,
  conceptualScore: 72,
  classOverlap: true,
  compositeRating: 'high',
  methodology: {
    version: 'v2.1.0',
    description: 'Weighted composite scoring.',
    sourceAttribution: ['USPTO TESS'],
  },
  matchedMarkRefs: [
    { type: 'Phonetic', evidence: 'Identical FORGE phoneme.', score: 85 },
    { type: 'Visual', evidence: 'Shared FORGE prefix.', score: 70 },
    { type: 'Class', evidence: 'Overlap in Class 9.', score: 100 },
  ],
};

const mockScoreNoConceptual: RiskScore = {
  ...mockScore,
  id: 'r2',
  compositeRating: 'medium',
  conceptualScore: null,
  matchedMarkRefs: [
    { type: 'Visual', evidence: 'Similar word structure.', score: 60 },
  ],
};

const mockResult: SearchResult = {
  id: '1',
  searchId: 's1',
  candidateMarkText: 'FORGE TEK',
  candidateSource: 'USPTO',
  candidateRef: 'US87654321',
  owner: 'Forge Technologies Inc.',
  jurisdiction: 'US',
  niceClasses: [9, 42],
  filingDate: '2025-03-14',
  status: 'Pending',
  riskScore: mockScore,
};

const mockResultNoConceptual: SearchResult = {
  ...mockResult,
  id: '2',
  candidateMarkText: 'FORTRESS GLOBAL',
  candidateSource: 'EUIPO',
  candidateRef: 'EU12345678',
  riskScore: mockScoreNoConceptual,
};

const routeState: RiskDetailRouteState = {
  result: mockResult,
  proposedMark: {
    markText: 'FORGE GLOBAL',
    jurisdiction: 'US',
    niceClasses: [9, 35, 42],
  },
  searchQuery: 'FORGE',
};

const routeStateNoConceptual: RiskDetailRouteState = {
  ...routeState,
  result: mockResultNoConceptual,
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

interface RenderOptions {
  resultId?: string;
  locationState?: RiskDetailRouteState | null;
  fetchResponse?: object;
}

const renderScreen = ({
  resultId = '1',
  locationState = routeState,
  fetchResponse,
}: RenderOptions = {}) => {
  if (fetchResponse !== undefined) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => fetchResponse }),
    );
  }

  const qc = makeQueryClient();

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[{ pathname: `/search/risk/${resultId}`, state: locationState }]}
      >
        <Routes>
          <Route path="/search/risk/:id" element={<RiskDetailScreen />} />
          <Route path="/search" element={<div>Search screen</div>} />
          <Route path="/office-actions" element={<div>Office actions screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  setMockRole('attorney');
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  useAuthStore.getState().clearSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 1. Renders risk content from route state
// ---------------------------------------------------------------------------

describe('RiskDetailScreen — route state rendering', () => {
  it('shows the proposed mark and candidate mark side by side', () => {
    renderScreen();
    expect(screen.getByText('FORGE GLOBAL')).toBeInTheDocument();
    expect(screen.getByText('FORGE TEK')).toBeInTheDocument();
  });

  it('shows proposed mark jurisdiction and classes', () => {
    renderScreen();
    expect(screen.getAllByText(/jurisdiction: US/i)).toHaveLength(2);
    expect(screen.getByText(/classes: 9, 35, 42/i)).toBeInTheDocument();
  });

  it('renders the HIGH risk label and icon', () => {
    renderScreen();
    expect(screen.getByRole('img', { name: /risk level: high/i })).toBeInTheDocument();
    expect(screen.getByText(/high risk/i)).toBeInTheDocument();
  });

  it('renders phonetic and class evidence panels', () => {
    renderScreen();
    expect(screen.getByText('Phonetic similarity')).toBeInTheDocument();
    expect(screen.getByText('Class similarity')).toBeInTheDocument();
    expect(screen.getByText('Identical FORGE phoneme.')).toBeInTheDocument();
  });

  it('shows scoring methodology version and source attribution', () => {
    renderScreen();
    expect(screen.getByText('v2.1.0')).toBeInTheDocument();
    expect(screen.getByText('USPTO TESS')).toBeInTheDocument();
  });

  it('shows "unavailable" for conceptual scoring when conceptualScore is null', () => {
    renderScreen({ locationState: routeStateNoConceptual });
    // The unavailable panel heading
    expect(screen.getByText('Conceptual similarity')).toBeInTheDocument();
    // The score bar row renders "Unavailable" label
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    // No fabricated conceptual evidence text
    expect(screen.queryByText(/word-vector/i)).not.toBeInTheDocument();
  });

  it('does NOT show the API fallback banner when route state is present', () => {
    renderScreen();
    expect(screen.queryByText(/loaded via api fallback/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Direct refresh fallback (no route state)
// ---------------------------------------------------------------------------

describe('RiskDetailScreen — direct refresh / no route state', () => {
  it('shows loading state while fetching', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
    );

    renderScreen({ locationState: null });

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows the API fallback banner after data loads', async () => {
    renderScreen({
      locationState: null,
      fetchResponse: {
        results: [mockResult],
        sourceStatuses: [],
      },
    });

    await screen.findByText(/loaded via api fallback/i);
  });

  it('shows "result not found" when API returns no matching result', async () => {
    renderScreen({
      locationState: null,
      resultId: 'nonexistent',
      fetchResponse: { results: [], sourceStatuses: [] },
    });

    await screen.findByText(/result not found/i);
    expect(screen.getByText(/direct page refresh requires a new search/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Role-gated action panel
// ---------------------------------------------------------------------------

describe('RiskDetailScreen — role-gated actions', () => {
  it('shows Save / Research / Discard / Export for admin', () => {
    setMockRole('admin');
    renderScreen();
    expect(screen.getByRole('button', { name: /save to matter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /research office actions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard result/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export risk report/i })).toBeInTheDocument();
  });

  it('shows Save / Research / Discard / Export for attorney', () => {
    setMockRole('attorney');
    renderScreen();
    expect(screen.getByRole('button', { name: /save to matter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard result/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export risk report/i })).toBeInTheDocument();
  });

  it('hides Save / Research / Discard for viewer; shows only Export', () => {
    setMockRole('viewer');
    renderScreen();
    expect(screen.queryByRole('button', { name: /save to matter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /research office actions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /discard result/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export risk report/i })).toBeInTheDocument();
    expect(screen.getByText(/attorney or admin role/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Matter save — success and error paths
// ---------------------------------------------------------------------------

describe('RiskDetailScreen — Save to matter', () => {
  it('opens the MatterSelectionModal when "Save to matter" is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(matterAdapter, 'listMatters').mockResolvedValue([]);
    renderScreen();

    await user.click(screen.getByRole('button', { name: /save to matter/i }));

    expect(await screen.findByRole('dialog', { name: /save to matter/i })).toBeInTheDocument();
    expect(screen.getByText(/development mode/i)).toBeInTheDocument();
  });

  it('shows existing matters in the modal', async () => {
    const user = userEvent.setup();

    const seedMatter: Matter = {
      id: 'matter-test-1',
      name: 'Test Clearance Matter',
      clientRef: 'TC-001',
      createdAt: new Date().toISOString(),
      savedResultIds: [],
    };
    vi.spyOn(matterAdapter, 'listMatters').mockResolvedValue([seedMatter]);

    renderScreen();
    await user.click(screen.getByRole('button', { name: /save to matter/i }));

    expect(await screen.findByText('Test Clearance Matter')).toBeInTheDocument();
  });

  it('saves result to an existing matter and shows success banner', async () => {
    const user = userEvent.setup();

    const seedMatter: Matter = {
      id: 'matter-test-1',
      name: 'Test Clearance Matter',
      clientRef: 'TC-001',
      createdAt: new Date().toISOString(),
      savedResultIds: [],
    };
    vi.spyOn(matterAdapter, 'listMatters').mockResolvedValue([seedMatter]);
    vi.spyOn(matterAdapter, 'saveToMatter').mockResolvedValue({
      matter: { ...seedMatter, savedResultIds: ['1'] },
      created: false,
      mocked: true,
    });

    renderScreen();
    await user.click(screen.getByRole('button', { name: /save to matter/i }));

    // Wait for the matter to appear, then click it
    const matterBtn = await screen.findByRole('button', { name: /Test Clearance Matter/i });
    await user.click(matterBtn);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /save to matter/i })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/result saved to matter/i)).toBeInTheDocument();
  });

  it('shows inline error in modal when saveToMatter throws', async () => {
    const user = userEvent.setup();

    vi.spyOn(matterAdapter, 'listMatters').mockResolvedValue([
      {
        id: 'matter-err',
        name: 'Failing Matter',
        clientRef: '',
        createdAt: new Date().toISOString(),
        savedResultIds: [],
      },
    ]);
    vi.spyOn(matterAdapter, 'saveToMatter').mockRejectedValue(new Error('Network gone.'));

    renderScreen();
    await user.click(screen.getByRole('button', { name: /save to matter/i }));
    const matterBtn = await screen.findByRole('button', { name: /Failing Matter/i });
    await user.click(matterBtn);

    const dialog = await screen.findByRole('dialog', { name: /save to matter/i });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Network gone.');
    expect(within(dialog).getByText(/try again/i)).toBeInTheDocument();
  });

  it('can create a new matter from the modal form', async () => {
    const user = userEvent.setup();

    vi.spyOn(matterAdapter, 'listMatters').mockResolvedValue([]);
    const newMatter: Matter = {
      id: 'matter-new',
      name: 'Brand New Matter',
      clientRef: 'BNM-001',
      createdAt: new Date().toISOString(),
      savedResultIds: ['1'],
    };
    vi.spyOn(matterAdapter, 'saveToMatter').mockResolvedValue({
      matter: newMatter,
      created: true,
      mocked: true,
    });

    renderScreen();
    await user.click(screen.getByRole('button', { name: /save to matter/i }));
    const dialog = await screen.findByRole('dialog', { name: /save to matter/i });

    // Switch to create view
    await user.click(within(dialog).getByRole('button', { name: /create new matter/i }));

    await user.type(within(dialog).getByLabelText(/matter name/i), 'Brand New Matter');
    await user.type(within(dialog).getByLabelText(/client reference/i), 'BNM-001');
    await user.click(within(dialog).getByRole('button', { name: /create matter and save/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /save to matter/i })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/new matter created and result saved/i)).toBeInTheDocument();
  }, 20_000);

  it('shows validation error when new matter name is empty', async () => {
    const user = userEvent.setup();
    vi.spyOn(matterAdapter, 'listMatters').mockResolvedValue([]);

    renderScreen();
    await user.click(screen.getByRole('button', { name: /save to matter/i }));
    const dialog = await screen.findByRole('dialog', { name: /save to matter/i });

    await user.click(within(dialog).getByRole('button', { name: /create new matter/i }));
    await user.click(within(dialog).getByRole('button', { name: /create matter and save/i }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(/matter name is required/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Discard confirmation flow
// ---------------------------------------------------------------------------

describe('RiskDetailScreen — Discard result', () => {
  it('opens confirmation modal when Discard is clicked', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: /discard result/i }));

    const dialog = await screen.findByRole('dialog', { name: /discard this result/i });
    expect(within(dialog).getByText(/FORGE TEK/)).toBeInTheDocument();
  });

  it('navigates to discarded state after confirmation', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: /discard result/i }));
    const dialog = await screen.findByRole('dialog', { name: /discard this result/i });
    await user.click(within(dialog).getByRole('button', { name: /^discard result$/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(/result discarded/i)).toBeInTheDocument();
  });

  it('keeps the result when "Keep result" is chosen', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: /discard result/i }));
    const dialog = await screen.findByRole('dialog', { name: /discard this result/i });
    await user.click(within(dialog).getByRole('button', { name: /keep result/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // Full screen is still visible
    expect(screen.getByRole('img', { name: /risk level: high/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. Keyboard interaction
// ---------------------------------------------------------------------------

describe('RiskDetailScreen — keyboard interaction', () => {
  it('allows programmatic focus on the Save to matter button', () => {
    renderScreen();

    const saveBtn = screen.getByRole('button', { name: /save to matter/i });
    saveBtn.focus();
    expect(saveBtn).toHaveFocus();
  });

  it('activates Save to matter modal via Enter', async () => {
    const user = userEvent.setup();
    vi.spyOn(matterAdapter, 'listMatters').mockResolvedValue([]);
    renderScreen();

    const saveBtn = screen.getByRole('button', { name: /save to matter/i });
    saveBtn.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: /save to matter/i })).toBeInTheDocument();
  });

  it('closes modal with Escape key', async () => {
    const user = userEvent.setup();
    vi.spyOn(matterAdapter, 'listMatters').mockResolvedValue([]);
    renderScreen();

    await user.click(screen.getByRole('button', { name: /save to matter/i }));
    await screen.findByRole('dialog', { name: /save to matter/i });

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /save to matter/i })).not.toBeInTheDocument(),
    );
  });

  it('navigates to Office Actions screen via keyboard on Research button', async () => {
    const user = userEvent.setup();
    setMockRole('admin');
    renderScreen();

    const researchBtn = screen.getByRole('button', { name: /research office actions/i });
    researchBtn.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Office actions screen')).toBeInTheDocument();
  });
});
