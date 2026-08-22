import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceStatusIndicator } from './SourceStatusIndicator';

describe('SourceStatusIndicator', () => {
  it('pairs every source state with visible text and a non-risk status indicator', () => {
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

    expect(screen.getByLabelText(/USPTO: Responded/)).toBeInTheDocument();
    expect(screen.getByLabelText('EUIPO: Pending')).toBeInTheDocument();
    expect(screen.getByLabelText('UKIPO: Pending')).toBeInTheDocument();
    expect(screen.getByLabelText('WIPO: Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/results are partial/i);
  });
});
