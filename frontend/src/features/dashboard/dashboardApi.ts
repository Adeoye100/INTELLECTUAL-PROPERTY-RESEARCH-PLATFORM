import type { DashboardSummary } from '../../types';
import { getApiClient } from '../../lib/api/client';

export const getDashboardSummary = () =>
  getApiClient().requestJson<DashboardSummary>('/dashboard/summary');
