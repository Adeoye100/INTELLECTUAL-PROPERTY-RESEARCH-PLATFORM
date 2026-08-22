import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskBadge, SourceStatusIndicator } from './ChartPrimitives';
import { RenewalDeadlineFlag } from './renewal';
import { renewalDeadline } from './renewalDomain';

describe('visual primitives', () => {
  it('renders explicit risk labels and safely handles unknown ratings', () => {
    render(<><RiskBadge rating="low" score={12} /><RiskBadge rating="unknown" /></>);
    expect(screen.getByLabelText(/Low risk, score 12/)).toBeInTheDocument();
    expect(screen.getByLabelText('Unknown risk')).toBeInTheDocument();
  });
  it('uses neutral renewal states with deterministic date boundaries', () => {
    const today = new Date('2026-08-22T12:00:00Z');
    expect(renewalDeadline('2026-08-21', today).state).toBe('overdue');
    expect(renewalDeadline('2026-09-21', today).state).toBe('due-soon');
    expect(renewalDeadline('2026-09-22', today).state).toBe('upcoming');
    expect(renewalDeadline(null, today).state).toBe('no-date');
    render(<RenewalDeadlineFlag date="2026-09-21" today={today} />);
    expect(screen.getByText(/Due soon/)).toBeInTheDocument();
  });
  it('maps complete to Responded and keeps zero results available', () => {
    render(<SourceStatusIndicator source="USPTO" status="complete" resultCount={0} />);
    expect(screen.getByLabelText('USPTO: Responded, 0 results')).toBeInTheDocument();
  });
});
