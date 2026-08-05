import { getApiClient } from '../../lib/api/client';
import type { Alert, WatchSummary, WatchUpsertRequest } from '../../types';
import { buildAlertsRequestUrl, type AlertFilters } from './watchAlertDomain';

export const listWatches = () => getApiClient().requestJson<WatchSummary[]>('/watches');

export const createWatch = (request: WatchUpsertRequest) =>
  getApiClient().requestJson<WatchSummary>('/watches', { method: 'POST', body: request });

export const updateWatch = (watchId: string, request: WatchUpsertRequest) =>
  getApiClient().requestJson<WatchSummary>(`/watches/${encodeURIComponent(watchId)}`, {
    method: 'PATCH',
    body: request,
  });

export const listAlerts = (filters: AlertFilters) =>
  getApiClient().requestJson<Alert[]>(buildAlertsRequestUrl(filters));

export const updateAlertReadState = (alertId: string, read: boolean) =>
  getApiClient().requestJson<Alert>(`/alerts/${encodeURIComponent(alertId)}`, {
    method: 'PATCH',
    body: { read },
  });
