import { describe, expect, it } from 'vitest';
import { hasCapability, navigationForRole } from './capabilities';

describe('capabilities and navigation', () => {
  it('verifies role capability sets', () => {
    expect(hasCapability('admin', 'search:view')).toBe(true);
    expect(hasCapability('attorney', 'search:view')).toBe(true);
    expect(hasCapability('viewer', 'search:view')).toBe(true);

    expect(hasCapability('admin', 'members:manage')).toBe(true);
    expect(hasCapability('attorney', 'members:manage')).toBe(false);
    expect(hasCapability('viewer', 'members:manage')).toBe(false);
  });

  it('keeps the product surface visible and filters it by role', () => {
    expect(navigationForRole('admin').map((n) => n.to)).toEqual([
      '/dashboard',
      '/search',
      '/risk-analysis',
      '/office-actions',
      '/portfolio',
      '/watches',
      '/reports',
      '/admin/users',
      '/admin/billing',
    ]);

    expect(navigationForRole('attorney').map((n) => n.to)).toEqual([
      '/dashboard',
      '/search',
      '/risk-analysis',
      '/office-actions',
      '/portfolio',
      '/watches',
      '/reports',
    ]);

    expect(navigationForRole('viewer').map((n) => n.to)).toEqual([
      '/dashboard',
      '/search',
      '/risk-analysis',
      '/office-actions',
      '/portfolio',
      '/watches',
    ]);
  });
});
