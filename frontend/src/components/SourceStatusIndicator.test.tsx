import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceStatusIndicator } from './SourceStatusIndicator';

describe('SourceStatusIndicator', () => {
  it('shows every source with a distinct text label and warns about partial results', () => {
    render(
      <SourceStatusIndicator
        statuses={[
          { source: 'USPTO', status: 'responded' },
          { source: 'UKIPO', status: 'pending' },
          { source: 'WIPO', status: 'unavailable' },
        ]}
      />
    );

    expect(screen.getByText('USPTO: Responded')).toHaveClass('bg-risk-low');
    expect(screen.getByText('UKIPO: Pending')).toHaveClass('bg-risk-medium');
    expect(screen.getByText('WIPO: Unavailable')).toHaveClass('bg-risk-high');
    expect(screen.getByRole('alert')).toHaveTextContent(/results are partial/i);
  });
});
