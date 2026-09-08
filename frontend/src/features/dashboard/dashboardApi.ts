import type { DashboardAnalytics } from '../../types';
import { getApiClient } from '../../lib/api/client';

export type DashboardRange = '7d' | '30d' | '90d';

export const getDashboardAnalytics = (range: DashboardRange = '30d') =>
  getApiClient().requestJson<DashboardAnalytics>(`/dashboard/analytics?range=${range}`);
