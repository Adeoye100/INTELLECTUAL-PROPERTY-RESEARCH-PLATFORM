import type { DashboardAnalytics } from '../../types';
import { getApiClient } from '../../lib/api/client';

export const getDashboardAnalytics = () =>
  getApiClient().requestJson<DashboardAnalytics>('/dashboard/analytics?range=30d');

/** Kept as a compatibility alias for consumers that only need the aggregate request. */
export const getDashboardSummary = getDashboardAnalytics;
