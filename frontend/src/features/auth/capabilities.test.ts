import { describe, expect, it, vi } from 'vitest';
import { hasCapability, navigationForRole } from './capabilities';
import { features } from '../../config/features';

describe('capabilities and navigation feature gating', () => {
  it('verifies role capability sets', () => {
    expect(hasCapability('admin', 'search:view')).toBe(true);
    expect(hasCapability('attorney', 'search:view')).toBe(true);
    expect(hasCapability('viewer', 'search:view')).toBe(true);

    expect(hasCapability('admin', 'members:manage')).toBe(true);
    expect(hasCapability('attorney', 'members:manage')).toBe(false);
    expect(hasCapability('viewer', 'members:manage')).toBe(false);
  });

  it('filters navigation items based on active feature flags', () => {
    // When flags are false
    vi.spyOn(features, 'searchEnabled', 'get').mockReturnValue(false);
    vi.spyOn(features, 'officeActionSearchEnabled', 'get').mockReturnValue(false);
    vi.spyOn(features, 'watchEnabled', 'get').mockReturnValue(false);

    const adminNavDisabled = navigationForRole('admin');
    expect(adminNavDisabled.map((n) => n.to)).toEqual([
      '/dashboard',
      '/portfolio',
      '/admin/users',
      '/admin/billing',
    ]);

    // When flags are true
    vi.spyOn(features, 'searchEnabled', 'get').mockReturnValue(true);
    vi.spyOn(features, 'officeActionSearchEnabled', 'get').mockReturnValue(true);
    vi.spyOn(features, 'watchEnabled', 'get').mockReturnValue(true);

    const adminNavEnabled = navigationForRole('admin');
    expect(adminNavEnabled.map((n) => n.to)).toEqual([
      '/dashboard',
      '/search',
      '/office-actions',
      '/portfolio',
      '/watches',
      '/admin/users',
      '/admin/billing',
    ]);

    // Viewer role filtering with enabled flags
    const viewerNavEnabled = navigationForRole('viewer');
    expect(viewerNavEnabled.map((n) => n.to)).toEqual([
      '/dashboard',
      '/search',
      '/office-actions',
      '/portfolio',
      '/watches',
    ]);
  });
});
