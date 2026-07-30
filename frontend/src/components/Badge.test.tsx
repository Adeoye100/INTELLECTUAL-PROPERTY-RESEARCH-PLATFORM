import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders with low risk style', () => {
    render(<Badge risk="low">Low Risk</Badge>);
    const badge = screen.getByText(/Low Risk/i);
    expect(badge).toHaveClass('bg-risk-low');
  });

  it('renders with high risk style', () => {
    render(<Badge risk="high">High Risk</Badge>);
    const badge = screen.getByText(/High Risk/i);
    expect(badge).toHaveClass('bg-risk-high');
  });

  it('renders without risk icon for none', () => {
    render(<Badge risk="none">Standard</Badge>);
    expect(screen.getByText(/Standard/i)).toBeInTheDocument();
  });
});
