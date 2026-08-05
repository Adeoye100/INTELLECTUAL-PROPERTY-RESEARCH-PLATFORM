import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NetworkStatusBanner } from './NetworkStatusBanner';

const originalOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

function setOnline(value: boolean) {
  Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => value });
}

afterEach(() => {
  if (originalOnline) Object.defineProperty(Navigator.prototype, 'onLine', originalOnline);
});

describe('NetworkStatusBanner', () => {
  it('announces offline and restored states', () => {
    setOnline(true);
    render(<NetworkStatusBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline');

    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByRole('status')).toHaveTextContent('Connection restored');
  });
});
