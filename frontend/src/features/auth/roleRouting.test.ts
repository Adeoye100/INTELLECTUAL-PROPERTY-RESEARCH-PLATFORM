import { describe, expect, it } from 'vitest';
import { authRedirectUrl, roleHomePath, safeAppRedirect } from './roleRouting';

describe('authentication redirect boundaries', () => {
  it('segregates the default destination by server-authorized application role', () => {
    expect(roleHomePath('admin')).toBe('/admin/users');
    expect(roleHomePath('attorney')).toBe('/portfolio');
    expect(roleHomePath('viewer')).toBe('/dashboard');
  });
  it('retains only same-origin in-app destinations', () => {
    expect(safeAppRedirect('/dashboard?welcome=1', '/dashboard')).toBe('/dashboard?welcome=1');
    expect(safeAppRedirect('https://unapproved.example.test/account', '/dashboard')).toBe('/dashboard');
    expect(safeAppRedirect('//unapproved.example.test/account', '/dashboard')).toBe('/dashboard');
    expect(safeAppRedirect('/\\unapproved.example.test', '/dashboard')).toBe('/dashboard');
    expect(safeAppRedirect('javascript:untrusted', '/dashboard')).toBe('/dashboard');
  });

  it('permits Supabase redirects only to explicit callback paths', () => {
    expect(new URL(authRedirectUrl('/auth/callback')).pathname).toBe('/auth/callback');
    expect(() => authRedirectUrl('/dashboard')).toThrow('approved callback path');
    expect(() => authRedirectUrl('https://unapproved.example.test/auth/callback')).toThrow('approved callback path');
  });
});
