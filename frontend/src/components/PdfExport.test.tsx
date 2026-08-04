import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfExport, type PdfReportRequest } from './PdfExport';

const searchRequest: PdfReportRequest = {
  reportType: 'search-results',
  context: {
    screen: 'search-results',
    query: 'FORGE',
    jurisdictions: ['US', 'EU'],
    niceClasses: '9, 42',
    resultIds: ['1', '2'],
  },
};

const successResponse = () => new Response(
  JSON.stringify({ downloadUrl: '/reports/forge-search.pdf', fileName: 'forge-search.pdf' }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PdfExport', () => {
  it('is keyboard operable, sends report type and screen context, then exposes a download', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfExport request={searchRequest} label="Export results PDF" />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Export results PDF' })).toHaveFocus();
    await user.keyboard('{Enter}');

    const download = await screen.findByRole('link', { name: 'Download PDF' });
    expect(download).toHaveAttribute('href', '/reports/forge-search.pdf');
    expect(download).toHaveAttribute('download', 'forge-search.pdf');
    expect(screen.getByText(/PDF ready: forge-search.pdf/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith('/api/reports/pdf', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(searchRequest),
    }));
  });

  it('disables generation while loading', async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
    render(<PdfExport request={searchRequest} />);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(screen.getByRole('button', { name: 'Generating PDF…' })).toBeDisabled();
    expect(screen.getByText('Preparing your report for download.')).toBeVisible();

    resolveRequest?.(successResponse());
    expect(await screen.findByRole('link', { name: 'Download PDF' })).toBeVisible();
  });

  it('shows a failure and retries successfully', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(successResponse());
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfExport request={searchRequest} />);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not generate/i);

    await user.click(screen.getByRole('button', { name: 'Retry export' }));
    expect(await screen.findByRole('link', { name: 'Download PDF' })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not call the endpoint while disabled', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfExport request={searchRequest} disabled />);

    const button = screen.getByRole('button', { name: 'Export PDF' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/becomes available when this screen has report data/i)).toBeVisible();
    await user.click(button);
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});

