export interface SupabaseEnvironment {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

const placeholder = (value: string) => /your[-_]|placeholder|replace[-_]?me|change[-_]?me|\.invalid|<[^>]+>/i.test(value);

export function resolveSupabaseConfig(
  environment: SupabaseEnvironment,
  runtime: { isDevelopment: boolean },
) {
  const urlValue = environment.VITE_SUPABASE_URL?.trim();
  const publishableKey = environment.VITE_SUPABASE_ANON_KEY?.trim();
  if (!urlValue || !publishableKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
  }
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid absolute URL.');
  }
  if (url.protocol !== 'https:' && !(runtime.isDevelopment && url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) {
    throw new Error('VITE_SUPABASE_URL must use HTTPS outside local development.');
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('VITE_SUPABASE_URL must not contain credentials, a query, fragment, or path.');
  }
  if (!runtime.isDevelopment && (placeholder(urlValue) || placeholder(publishableKey))) {
    throw new Error('Supabase browser configuration must not use placeholder values outside development.');
  }
  if (/service[_-]?role|sb_secret/i.test(publishableKey)) {
    throw new Error('VITE_SUPABASE_ANON_KEY must be a browser publishable/anon key, never a secret key.');
  }
  return Object.freeze({ url: url.origin, publishableKey });
}
