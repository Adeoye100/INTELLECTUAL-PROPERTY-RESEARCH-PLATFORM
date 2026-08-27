import { describe, expect, it } from 'vitest';
import { resolveSupabaseConfig } from './supabaseConfig';

describe('Supabase browser configuration', () => {
  it('accepts an HTTPS project URL and browser publishable key', () => {
    expect(resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_browser_test',
    }, { isDevelopment: false })).toEqual({
      url: 'https://project-ref.supabase.co',
      publishableKey: 'sb_publishable_browser_test',
    });
  });

  it('rejects placeholders, HTTP, and secret-key-shaped browser values outside development', () => {
    expect(() => resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_browser_test',
    }, { isDevelopment: false })).toThrow(/placeholder/i);
    expect(() => resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'http://project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_browser_test',
    }, { isDevelopment: false })).toThrow(/HTTPS/i);
    expect(() => resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_secret_not_for_browser',
    }, { isDevelopment: false })).toThrow(/never a secret key/i);
  });
});
