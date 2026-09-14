import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreliminaryReportsScreen } from './PreliminaryReportsScreen';

vi.mock('../portfolio/portfolioApi', () => ({
  listPortfolioMarks: vi.fn(async () => ({
    items: [{
      id: '11111111-1111-4111-8111-111111111111',
      firmId: '22222222-2222-4222-8222-222222222222',
      ownerUserId: null,
      markText: 'FORGE',
      jurisdiction: 'US',
      sourceRegistry: 'USPTO',
      registryReference: '98123456',
      niceClasses: [9, 42],
      status: 'registered',
      filingDate: '2025-01-01',
      registrationDate: null,
      renewalDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
  })),
}));

vi.mock('../../components/PdfExport', () => ({
  PdfExport: ({ request, label }: { request: { reportType: string; context: { portfolioMarkId: string } }; label: string }) => (
    <button type="button" data-testid="server-pdf" data-report-type={request.reportType} data-mark-id={request.context.portfolioMarkId}>{label}</button>
  ),
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PreliminaryReportsScreen /></QueryClientProvider>);
}

describe('PreliminaryReportsScreen', () => {
  it('offers the authenticated server-side portfolio PDF path and no browser print fallback', async () => {
    renderScreen();
    const select = await screen.findByLabelText('Select portfolio mark');
    fireEvent.change(select, { target: { value: '11111111-1111-4111-8111-111111111111' } });

    const exportButton = await screen.findByTestId('server-pdf');
    expect(exportButton).toHaveAttribute('data-report-type', 'portfolio-summary');
    expect(exportButton).toHaveAttribute('data-mark-id', '11111111-1111-4111-8111-111111111111');
    expect(screen.queryByText(/Print \/ Save PDF/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Browser print-to-PDF generation is intentionally disabled/i)).toBeInTheDocument();
  });
});
