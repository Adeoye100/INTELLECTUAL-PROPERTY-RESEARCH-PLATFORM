import type { Alert } from '../../types';

export interface AlertFilters {
  status: '' | 'unread' | 'read' | 'dismissed';
  severity: '' | 'medium' | 'high';
  watchId?: string;
  portfolioMarkId?: string;
  createdFrom: string;
  createdTo: string;
}

export const defaultAlertFilters: AlertFilters = {
  status: '',
  severity: '',
  createdFrom: '',
  createdTo: '',
};

export const alertFiltersFromParams = (params: URLSearchParams): AlertFilters => ({
  status: (['unread', 'read', 'dismissed'].includes(params.get('status') ?? '') ? params.get('status') : '') as AlertFilters['status'],
  severity: (['medium', 'high'].includes(params.get('severity') ?? '') ? params.get('severity') : '') as AlertFilters['severity'],
  watchId: params.get('watchId') ?? undefined,
  portfolioMarkId: params.get('portfolioMarkId') ?? params.get('markId') ?? undefined,
  createdFrom: params.get('createdFrom') ?? params.get('dateFrom') ?? '',
  createdTo: params.get('createdTo') ?? params.get('dateTo') ?? '',
});

export const alertFiltersToParams = (filters: AlertFilters) => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.watchId) params.set('watchId', filters.watchId);
  if (filters.portfolioMarkId) params.set('portfolioMarkId', filters.portfolioMarkId);
  if (filters.createdFrom) params.set('createdFrom', filters.createdFrom);
  if (filters.createdTo) params.set('createdTo', filters.createdTo);
  return params;
};

export const sortAlertsNewestFirst = (alerts: Alert[]) => [...alerts].sort(
  (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
);

export const filterAlerts = (alerts: Alert[], filters: AlertFilters) => sortAlertsNewestFirst(alerts.filter((alert) => {
  if (filters.status && alert.status !== filters.status) return false;
  if (filters.severity && alert.severity !== filters.severity) return false;
  if (filters.watchId && alert.watchId !== filters.watchId) return false;
  if (filters.portfolioMarkId && alert.portfolioMarkId !== filters.portfolioMarkId) return false;
  if (filters.createdFrom && alert.createdAt < `${filters.createdFrom}T00:00:00.000Z`) return false;
  if (filters.createdTo && alert.createdAt > `${filters.createdTo}T23:59:59.999Z`) return false;
  return true;
}));

export const buildAlertsRequestUrl = (filters: AlertFilters) => {
  const params = alertFiltersToParams(filters);
  return `/alerts${params.size ? `?${params.toString()}` : ''}`;
};
