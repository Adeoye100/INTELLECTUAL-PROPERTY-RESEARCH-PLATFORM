import { describe, expect, it } from 'vitest';
import { filterPortfolioMarks, getRenewalWarning } from './portfolioDomain';
import type { PortfolioMark } from '../../types';

const mark = (overrides: Partial<PortfolioMark>): PortfolioMark => ({
  id: 'p1', firmId: 'f1', ownerUserId: 'u1', markText: 'FORGE GLOBAL', jurisdiction: 'US',
  niceClasses: [9], status: 'Registered', filingDate: '2020-01-01', renewalDate: '2026-08-20',
  sourceRegistry: 'USPTO', ...overrides,
});

describe('portfolio renewal and filters', () => {
  it('distinguishes overdue, urgent, upcoming, and safe renewal dates', () => {
    const now = new Date('2026-08-04T12:00:00.000Z');
    expect(getRenewalWarning('2026-08-03', now)).toMatchObject({ level: 'high', label: 'Overdue by 1 day' });
    expect(getRenewalWarning('2026-08-20', now)).toMatchObject({ level: 'high', label: 'Due in 16 days' });
    expect(getRenewalWarning('2026-10-01', now)).toMatchObject({ level: 'medium' });
    expect(getRenewalWarning('2027-08-04', now)).toMatchObject({ level: 'low' });
  });

  it('applies mark, jurisdiction, status, and renewal filters', () => {
    const marks = [mark({}), mark({ id: 'p2', markText: 'INNOVATE PRO', jurisdiction: 'EU', status: 'Pending', renewalDate: '2027-01-01' })];
    expect(filterPortfolioMarks(marks, { mark: 'forge', jurisdiction: 'US', status: 'Registered', renewalWindow: '30' }, new Date('2026-08-04T12:00:00Z'))).toHaveLength(1);
    expect(filterPortfolioMarks(marks, { mark: '', jurisdiction: 'EU', status: '', renewalWindow: 'all' })).toEqual([marks[1]]);
  });
});
