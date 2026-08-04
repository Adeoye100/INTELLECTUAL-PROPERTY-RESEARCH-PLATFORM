import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceStatusIndicator } from './SourceStatusIndicator';

describe('SourceStatusIndicator', () => {
  it('pairs every source state with visible text and an icon-backed severity badge', () => {
    render(
      <SourceStatusIndicator
        statuses={[
          { source: 'USPTO', status: 'complete', resultCount: 2 },
          { source: 'EUIPO', status: 'pending' },
          { source: 'UKIPO', status: 'delayed' },
          { source: 'WIPO', status: 'unavailable' },
        ]}
      />,
    );

    expect(screen.getByText(/USPTO: Complete/)).toHaveClass('bg-risk-low');
    expect(screen.getByText('EUIPO: Pending')).toHaveClass('bg-risk-medium');
    expect(screen.getByText('UKIPO: Delayed')).toHaveClass('bg-risk-medium');
    expect(screen.getByText('WIPO: Unavailable')).toHaveClass('bg-risk-high');
    expect(screen.getByRole('alert')).toHaveTextContent(/results are partial/i);
  });
});
