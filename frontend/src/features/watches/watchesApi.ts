import { getApiClient } from '../../lib/api/client';
import type { Alert, WatchSummary, WatchUpsertRequest } from '../../types';
import { buildAlertsRequestUrl, type AlertFilters } from './watchAlertDomain';

interface ListResponse<T> {
  items: T[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
}

export const listWatches = () =>
  getApiClient().requestJson<ListResponse<WatchSummary> | WatchSummary[]>('/watches').then((response) =>
    Array.isArray(response) ? response : response.items ?? [],
  );

export const createWatch = (request: WatchUpsertRequest) =>
  getApiClient().requestJson<WatchSummary>('/watches', { method: 'POST', body: request });

export const updateWatch = (watchId: string, request: Partial<WatchUpsertRequest>) =>
  getApiClient().requestJson<WatchSummary>(`/watches/${encodeURIComponent(watchId)}`, {
    method: 'PATCH',
    body: request,
  });

export const listAlerts = (filters: AlertFilters) =>
  getApiClient().requestJson<ListResponse<Alert> | Alert[]>(buildAlertsRequestUrl(filters)).then((response) =>
    Array.isArray(response) ? response : response.items ?? [],
  );

export const updateAlertReadState = (alertId: string, read: boolean) =>
  getApiClient().requestJson<Alert>(`/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: { action: read ? 'read' : 'dismiss' },
  });

export const dismissAlert = (alertId: string) =>
  getApiClient().requestJson<Alert>(`/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: { action: 'dismiss' },
  });
