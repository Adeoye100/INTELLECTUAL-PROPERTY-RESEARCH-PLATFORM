import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShieldStatic } from './ShieldStatic';

describe('ShieldStatic', () => {
  it('exposes interactive facets to keyboard users', async () => {
    const onSelect = vi.fn();
    const onHover = vi.fn();
    const user = userEvent.setup();
    render(<ShieldStatic animated={false} onFacetSelect={onSelect} onFacetHover={onHover} />);

    const facet = screen.getAllByRole('button')[0];
    facet.focus();
    expect(facet).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(0);
  });
});
