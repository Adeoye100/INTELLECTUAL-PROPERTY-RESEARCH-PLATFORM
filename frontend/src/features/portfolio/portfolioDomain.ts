import type { PortfolioMark } from '../../types';

export type RenewalWindow = 'all' | 'overdue' | '30' | '90' | '365';

export interface PortfolioFilters {
  mark: string;
  jurisdiction: string;
  status: string;
  renewalWindow: RenewalWindow;
}

export const defaultPortfolioFilters: PortfolioFilters = {
  mark: '',
  jurisdiction: '',
  status: '',
  renewalWindow: 'all',
};

const startOfUtcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export const renewalDaysRemaining = (renewalDate: string | null | undefined, now = new Date()) => {
  if (!renewalDate || !/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return Number.POSITIVE_INFINITY;
  return Math.ceil((Date.parse(`${renewalDate}T00:00:00Z`) - startOfUtcDay(now)) / 86_400_000);
};

export const getRenewalWarning = (renewalDate: string | null | undefined, now = new Date()) => {
  if (!renewalDate || !/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return { level: 'none' as const, label: 'No renewal date', days: Number.POSITIVE_INFINITY };
  const days = renewalDaysRemaining(renewalDate, now);
  if (days < 0) return { level: 'high' as const, label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`, days };
  if (days <= 30) return { level: 'high' as const, label: `Due in ${days} day${days === 1 ? '' : 's'}`, days };
  if (days <= 90) return { level: 'medium' as const, label: `Due in ${days} days`, days };
  return { level: 'low' as const, label: 'No immediate action', days };
};

export const portfolioFiltersFromParams = (params: URLSearchParams): PortfolioFilters => ({
  mark: params.get('mark') ?? '',
  jurisdiction: params.get('jurisdiction') ?? '',
  status: params.get('status') ?? '',
  renewalWindow: (['all', 'overdue', '30', '90', '365'].includes(params.get('renewal') ?? '')
    ? params.get('renewal')
    : 'all') as RenewalWindow,
});

export const portfolioFiltersToParams = (filters: PortfolioFilters) => {
  const params = new URLSearchParams();
  if (filters.mark.trim()) params.set('mark', filters.mark.trim());
  if (filters.jurisdiction) params.set('jurisdiction', filters.jurisdiction);
  if (filters.status) params.set('status', filters.status);
  if (filters.renewalWindow !== 'all') params.set('renewal', filters.renewalWindow);
  return params;
};

export const filterPortfolioMarks = (marks: PortfolioMark[], filters: PortfolioFilters, now = new Date()) =>
  marks.filter((mark) => {
    if (filters.mark && !mark.markText.toLowerCase().includes(filters.mark.toLowerCase())) return false;
    if (filters.jurisdiction && mark.jurisdiction !== filters.jurisdiction) return false;
    if (filters.status && mark.status.toLowerCase() !== filters.status.toLowerCase()) return false;
    if (filters.renewalWindow !== 'all') {
      const days = renewalDaysRemaining(mark.renewalDate, now);
      if (filters.renewalWindow === 'overdue') return days < 0;
      if (days < 0 || days > Number(filters.renewalWindow)) return false;
    }
    return true;
  });
