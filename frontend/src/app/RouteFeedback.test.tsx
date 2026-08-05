import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RouteErrorScreen, RouteLoading } from './RouteFeedback';

function BrokenRoute(): ReactNode {
  throw new Error('Route module failed to render.');
}

describe('route feedback', () => {
  it('focuses a recoverable route-level error with retry and safe navigation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([{ path: '/', element: <BrokenRoute />, errorElement: <RouteErrorScreen /> }]);
    render(<RouterProvider router={router} />);

    const heading = await screen.findByRole('heading', { name: 'This page encountered an error' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('Route module failed to render.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry page' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Return to your home' })).toHaveAttribute('href', '/app');
  });

  it('announces route loading', () => {
    render(<RouteLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading page');
  });
});
