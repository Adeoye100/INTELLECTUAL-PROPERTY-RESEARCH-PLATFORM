import { describe, expect, it } from 'vitest';
import {
  authRedirectUrl,
  canonicalFrontendUrl,
  PRODUCTION_AUTH_ORIGIN,
  resolveAuthOrigin,
  roleHomePath,
  safeAppRedirect,
} from './roleRouting';

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

  it('pins production OAuth to the canonical domain instead of the current Vercel hostname', () => {
    expect(resolveAuthOrigin({
      isDevelopment: false,
      currentOrigin: 'https://intellectual-property-research-plat.vercel.app',
    })).toBe(PRODUCTION_AUTH_ORIGIN);
    expect(resolveAuthOrigin({
      isDevelopment: false,
      currentOrigin: 'https://preview.example.test',
      configuredOrigin: 'https://approved-preview.example.test/',
    })).toBe('https://approved-preview.example.test');
    expect(resolveAuthOrigin({
      isDevelopment: true,
      currentOrigin: 'http://localhost:5173',
    })).toBe('http://localhost:5173');
  });

  it('redirects noncanonical production hosts before session restoration', () => {
    expect(canonicalFrontendUrl({
      isDevelopment: false,
      currentOrigin: 'https://preview.example.test',
      currentHref: 'https://preview.example.test/watches?status=active#top',
    })).toBe('https://fgiprp.com/watches?status=active#top');
    expect(canonicalFrontendUrl({
      isDevelopment: false,
      currentOrigin: PRODUCTION_AUTH_ORIGIN,
      currentHref: 'https://fgiprp.com/dashboard',
    })).toBeNull();
    expect(canonicalFrontendUrl({
      isDevelopment: true,
      currentOrigin: 'http://localhost:5173',
      currentHref: 'http://localhost:5173/auth/login',
    })).toBeNull();
  });

  it('permits Supabase redirects only to explicit callback paths', () => {
    expect(new URL(authRedirectUrl('/auth/callback')).pathname).toBe('/auth/callback');
    expect(() => authRedirectUrl('/dashboard')).toThrow('approved callback path');
    expect(() => authRedirectUrl('https://unapproved.example.test/auth/callback')).toThrow('approved callback path');
  });
});
