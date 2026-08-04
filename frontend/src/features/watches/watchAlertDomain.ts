import type { Alert } from '../../types';

export interface AlertFilters {
  readState: '' | 'read' | 'unread';
  severity: '' | 'low' | 'medium' | 'high';
  source: string;
  dateFrom: string;
  dateTo: string;
}

export const defaultAlertFilters: AlertFilters = {
  readState: '',
  severity: '',
  source: '',
  dateFrom: '',
  dateTo: '',
};

export const alertFiltersFromParams = (params: URLSearchParams): AlertFilters => ({
  readState: (['read', 'unread'].includes(params.get('read') ?? '') ? params.get('read') : '') as AlertFilters['readState'],
  severity: (['low', 'medium', 'high'].includes(params.get('severity') ?? '') ? params.get('severity') : '') as AlertFilters['severity'],
  source: params.get('source') ?? '',
  dateFrom: params.get('dateFrom') ?? '',
  dateTo: params.get('dateTo') ?? '',
});

export const alertFiltersToParams = (filters: AlertFilters) => {
  const params = new URLSearchParams();
  if (filters.readState) params.set('read', filters.readState);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.source) params.set('source', filters.source);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return params;
};

export const sortAlertsNewestFirst = (alerts: Alert[]) => [...alerts].sort(
  (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
);

export const filterAlerts = (alerts: Alert[], filters: AlertFilters) => sortAlertsNewestFirst(alerts.filter((alert) => {
  if (filters.readState === 'read' && !alert.read) return false;
  if (filters.readState === 'unread' && alert.read) return false;
  if (filters.severity && alert.severity !== filters.severity) return false;
  if (filters.source && alert.source !== filters.source) return false;
  if (filters.dateFrom && alert.createdAt < `${filters.dateFrom}T00:00:00.000Z`) return false;
  if (filters.dateTo && alert.createdAt > `${filters.dateTo}T23:59:59.999Z`) return false;
  return true;
}));

export const buildAlertsRequestUrl = (filters: AlertFilters) => {
  const params = alertFiltersToParams(filters);
  return `/api/alerts${params.size ? `?${params.toString()}` : ''}`;
};
