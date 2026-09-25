import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/authStore';
import { OfficeActionResearchScreen } from './OfficeActionResearchScreen';

const mark = { id: 'p1', firmId: 'f1', ownerUserId: 'u1', markText: 'FORGE GLOBAL', jurisdiction: 'US', niceClasses: [9], status: 'registered', filingDate: '2020-01-01', renewalDate: '2030-01-01', sourceRegistry: 'USPTO', registryReference: 'TEST-1', registrationDate: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const officeAction = { id: 'oa1', portfolioMarkId: null, sourceRegistry: 'USPTO', sourceReferenceId: 'USPTO OA-2025-10', applicationNumber: '99112233', markText: 'FORGE LABS', owner: 'Forge Labs LLC', jurisdiction: 'US', documentType: 'office_action', officeActionDate: '2025-10-01', examinerName: 'Examiner', examinerReasoningSummary: 'Shared dominant term and related software services.', summaryMethod: 'registry', sourceDocumentUrl: null, sourceMetadata: {}, referenceText: 'USPTO OA-2025-10', linkedPrecedentRef: null };
const matter = { id: 'm1', name: 'FORGE clearance', clientRef: 'FG-1', createdAt: '2026-01-02T00:00:00.000Z', savedResultIds: [] };

function renderScreen(action = officeAction) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = url.includes('/office-actions/search') ? { results: [action], sourceStatuses: [{ source: 'USPTO', status: 'complete', resultCount: 1 }], partial: false, requestId: 'oa-test' }
      : url.endsWith('/api/v1/matters') && (!init?.method || init.method === 'GET') ? { items: [matter], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } }
        : url.includes('/office-action-refs') ? { id: 'ref-1', portfolioMarkId: 'p1', referenceText: 'USPTO OA-2025-10', examinerReasoningSummary: 'Shared dominant term', linkedPrecedentRef: 'oa1', createdAt: '2026-01-01T00:00:00.000Z' }
          : { items: [mark], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><OfficeActionResearchScreen /></MemoryRouter></QueryClientProvider>);
  return fetchMock;
}

beforeEach(() => {
  act(() => useAuthStore.getState().setSession('office-action-token', {
    id: 'u1', email: 'attorney@example.test', fullName: 'Attorney', role: 'attorney', firmId: 'firm-1',
  }));
});

afterEach(() => {
  act(() => useAuthStore.getState().clearSession());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OfficeActionResearchScreen', () => {
  it('supports the keyboard-only search and link journey without searching on each keystroke', async () => {
    const user = userEvent.setup();
    const fetchMock = renderScreen();
    const markInput = screen.getByRole('textbox', { name: 'Mark Text' });

    markInput.focus();
    await user.keyboard('FORGE');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/office-actions/search'))).toHaveLength(0);

    const submit = screen.getByRole('button', { name: 'Apply Filters' });
    submit.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('USPTO OA-2025-10')).toBeVisible();

    const openLink = screen.getByRole('button', { name: 'Link to Mark' });
    openLink.focus();
    await user.keyboard('{Enter}');
    const markChoice = await screen.findByRole('button', { name: /FORGE GLOBAL/ });
    fireEvent.click(markChoice);
    expect(await screen.findByRole('status')).toHaveTextContent(/Office action reference linked/i);
  }, 20_000);

  it('links an Office Action to a matter only through a real portfolio mark context', async () => {
    const user = userEvent.setup();
    const fetchMock = renderScreen();
    await user.type(screen.getByRole('textbox', { name: 'Mark Text' }), 'FORGE');
    await user.click(screen.getByRole('button', { name: 'Apply Filters' }));
    await screen.findByText('USPTO OA-2025-10');

    await user.click(screen.getByRole('button', { name: 'Link to Mark' }));
    await user.click(screen.getByRole('button', { name: 'Link to Matter Case File' }));
    await user.selectOptions(await screen.findByLabelText('Portfolio context'), 'p1');
    await user.click(await screen.findByRole('button', { name: /FORGE clearance/ }));

    expect(await screen.findByRole('status')).toHaveTextContent(/linked to the selected matter/i);
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('/portfolio-marks/p1/office-action-refs'))).toBe(true);
    expect(urls.some((url) => url.includes('/matters/m1/office-action-refs'))).toBe(true);
    expect(urls.some((url) => url.includes('00000000-0000-0000-0000-000000000001'))).toBe(false);
  }, 20_000);

  it('renders Office Action metadata as text rather than markup', async () => {
    const user = userEvent.setup();
    renderScreen({ ...officeAction, sourceReferenceId: '<office-action-reference>', referenceText: '<office-action-reference>', examinerReasoningSummary: '<office-action-summary>' });
    await user.type(screen.getByRole('textbox', { name: 'Mark Text' }), 'FORGE');
    await user.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(await screen.findByText('<office-action-reference>')).toBeVisible();
    expect(screen.getByText('<office-action-summary>')).toBeVisible();
    expect(document.querySelector('office-action-reference')).toBeNull();
    expect(document.querySelector('office-action-summary')).toBeNull();
  });

  it('allows a viewer to research precedents without exposing link mutations', async () => {
    act(() => useAuthStore.getState().setSession('viewer-token', {
      id: 'u2', email: 'viewer@example.test', fullName: 'Viewer', role: 'viewer', firmId: 'firm-1',
    }));
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByRole('textbox', { name: 'Mark Text' }), 'FORGE');
    await user.click(screen.getByRole('button', { name: 'Apply Filters' }));

    expect(await screen.findByText('USPTO OA-2025-10')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Link to Mark' })).not.toBeInTheDocument();
  });
});
