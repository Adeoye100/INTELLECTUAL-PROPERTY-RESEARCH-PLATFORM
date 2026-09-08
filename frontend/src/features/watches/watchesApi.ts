import { getApiClient } from '../../lib/api/client';
import type { Alert, AlertListResponse, WatchSummary, WatchListResponse, WatchUpsertRequest } from '../../types';
import { buildAlertsRequestUrl, type AlertFilters } from './watchAlertDomain';

export const listWatches = () =>
  getApiClient().requestJson<WatchListResponse | WatchSummary[]>('/watches').then((response) =>
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
  getApiClient().requestJson<AlertListResponse | Alert[]>(buildAlertsRequestUrl(filters)).then((response) =>
    Array.isArray(response) ? response : response.items ?? [],
  );

export const markAlertRead = (alertId: string) =>
  getApiClient().requestJson<Alert>(`/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: { action: 'read' },
  });

export const dismissAlert = (alertId: string) =>
  getApiClient().requestJson<Alert>(`/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: { action: 'dismiss' },
  });
