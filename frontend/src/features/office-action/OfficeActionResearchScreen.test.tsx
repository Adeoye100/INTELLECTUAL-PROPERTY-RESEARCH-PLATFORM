import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfficeActionResearchScreen } from './OfficeActionResearchScreen';

const mark = { id: 'p1', firmId: 'f1', ownerUserId: 'u1', markText: 'FORGE GLOBAL', jurisdiction: 'US', niceClasses: [9], status: 'Registered', filingDate: '2020-01-01', renewalDate: '2030-01-01', sourceRegistry: 'USPTO' };
const officeAction = { id: 'oa1', portfolioMarkId: null, referenceText: 'USPTO OA-2025-10', examinerReasoningSummary: 'Shared dominant term and related software services.', linkedPrecedentRef: null };

function renderScreen(action = officeAction) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/office-actions/search') ? [action]
      : url.includes('/office-actions/link') ? { success: true, message: 'Linked', linkedOfficeActionId: 'oa1', linkedPortfolioMarkId: 'p1' }
        : [mark];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><OfficeActionResearchScreen /></MemoryRouter></QueryClientProvider>);
  return fetchMock;
}

afterEach(() => {
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

    const openLink = screen.getByRole('button', { name: 'Link to Case File' });
    openLink.focus();
    await user.keyboard('{Enter}');
    const markChoice = await screen.findByRole('button', { name: /FORGE GLOBAL/ });
    markChoice.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('Office action linked');
  }, 20_000);

  it('renders Office Action metadata as text rather than markup', async () => {
    const user = userEvent.setup();
    renderScreen({ ...officeAction, referenceText: '<office-action-reference>', examinerReasoningSummary: '<office-action-summary>' });
    await user.type(screen.getByRole('textbox', { name: 'Mark Text' }), 'FORGE');
    await user.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(await screen.findByText('<office-action-reference>')).toBeVisible();
    expect(screen.getByText('<office-action-summary>')).toBeVisible();
    expect(document.querySelector('office-action-reference')).toBeNull();
    expect(document.querySelector('office-action-summary')).toBeNull();
  });
});
