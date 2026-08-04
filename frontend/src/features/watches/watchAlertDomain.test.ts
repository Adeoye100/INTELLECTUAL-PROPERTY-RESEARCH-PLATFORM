import { describe, expect, it } from 'vitest';
import type { Alert } from '../../types';
import { filterAlerts, sortAlertsNewestFirst } from './watchAlertDomain';

const alert = (overrides: Partial<Alert>): Alert => ({
  id: 'a1', watchId: 'w1', matchedFilingRef: 'US1', riskScoreId: 'r1', riskResultId: '1', read: false,
  createdAt: '2026-08-03T10:00:00Z', matchedMarkText: 'FORGE LABS', protectedMarkText: 'FORGE GLOBAL',
  severity: 'high', source: 'USPTO', supportingEvidence: ['Phonetic match'], ...overrides,
});

describe('alert ordering and filters', () => {
  const alerts = [alert({ id: 'old', createdAt: '2026-08-01T23:00:00Z' }), alert({ id: 'new', createdAt: '2026-08-04T01:00:00Z', read: true, severity: 'medium', source: 'EUIPO' }), alert({ id: 'middle', createdAt: '2026-08-03T12:00:00Z' })];

  it('sorts newest first from actual timestamps', () => {
    expect(sortAlertsNewestFirst(alerts).map(({ id }) => id)).toEqual(['new', 'middle', 'old']);
  });

  it('combines read, severity, source, and date filters', () => {
    expect(filterAlerts(alerts, { readState: 'read', severity: 'medium', source: 'EUIPO', dateFrom: '2026-08-04', dateTo: '2026-08-04' }).map(({ id }) => id)).toEqual(['new']);
  });
});
