/**
 * matterAdapter.ts
 *
 * MOCK-ONLY frontend adapter for the "Matter" (case file) feature.
 *
 * ⚠️  THIS ADAPTER DOES NOT PERSIST DATA TO ANY SERVER.
 * It stores matter state in localStorage for the duration of the browser session.
 * Once the backend `/api/matters` and `POST /api/matters/:id/risk-results`
 * endpoints are implemented, replace this adapter with one that calls those APIs.
 *
 * The adapter satisfies the `MatterAdapter` interface so the swap is a single
 * import change — no calling code needs to change.
 */

import type { Matter, MatterAdapter, MatterSaveRequest, MatterSaveResult } from '../../types';

const STORAGE_KEY = 'forge-matters-mock';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadMatters(): Matter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedMatters();
    return JSON.parse(raw) as Matter[];
  } catch {
    return seedMatters();
  }
}

function saveMatters(matters: Matter[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matters));
  } catch {
    // localStorage may be unavailable in certain test environments; ignore silently.
  }
}

/** Pre-seeds a couple of demo matters so the list is never empty on first use. */
function seedMatters(): Matter[] {
  const seed: Matter[] = [
    {
      id: 'matter-demo-1',
      name: 'Q3 Clearance — FORGE GLOBAL',
      clientRef: 'FG-2026-Q3',
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
      savedResultIds: [],
    },
    {
      id: 'matter-demo-2',
      name: 'Portfolio Audit 2026',
      clientRef: 'FG-2026-AUDIT',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000).toISOString(),
      savedResultIds: [],
    },
  ];
  saveMatters(seed);
  return seed;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Simulates a ~400 ms network round-trip so loading states in tests behave
 * realistically. Controlled by the VITE_MOCK_ADAPTER_DELAY env variable in tests.
 */
const DELAY_MS = import.meta.env.VITE_MOCK_ADAPTER_DELAY === '0' ? 0 : 400;

async function simulateDelay(): Promise<void> {
  if (DELAY_MS > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS));
  }
}

export const matterAdapter: MatterAdapter = {
  /**
   * Returns all matters in the mock session.
   *
   * MOCK-ONLY: reads from localStorage.
   * Replace with `GET /api/matters` when the backend is available.
   */
  async listMatters(): Promise<Matter[]> {
    await simulateDelay();
    return loadMatters();
  },

  /**
   * Saves a risk result to an existing or new matter.
   *
   * MOCK-ONLY: writes to localStorage only.
   * Replace with `POST /api/matters/:id/risk-results` (or a create+link combo)
   * when the backend is available.
   */
  async saveToMatter(request: MatterSaveRequest): Promise<MatterSaveResult> {
    await simulateDelay();

    const matters = loadMatters();
    let created = false;
    let matter: Matter;

    if (request.matterId) {
      const existing = matters.find((m) => m.id === request.matterId);
      if (!existing) {
        throw new Error(
          `Matter "${request.matterId}" not found. It may have been deleted in another tab.`,
        );
      }
      if (!existing.savedResultIds.includes(request.resultId)) {
        existing.savedResultIds = [...existing.savedResultIds, request.resultId];
      }
      matter = existing;
    } else {
      if (!request.newMatterName?.trim()) {
        throw new Error('A matter name is required when creating a new matter.');
      }
      const now = new Date().toISOString();
      matter = {
        id: `matter-${Date.now()}`,
        name: request.newMatterName.trim(),
        clientRef: request.newMatterClientRef?.trim() ?? '',
        createdAt: now,
        savedResultIds: [request.resultId],
      };
      matters.push(matter);
      created = true;
    }

    saveMatters(matters);

    return { matter, created, mocked: true };
  },
};
