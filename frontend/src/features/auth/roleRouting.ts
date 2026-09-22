import type { UserRole } from '../../types';

export const roleHomePath = (role: UserRole) => ({
  admin: '/admin/users',
  attorney: '/portfolio',
  viewer: '/dashboard',
}[role]);

const callbackPaths = new Set(['/auth/callback', '/auth/reset-password', '/auth/verify-email']);
export const PRODUCTION_AUTH_ORIGIN = 'https://fgiprp.com';

interface AuthOriginRuntime {
  isDevelopment: boolean;
  currentOrigin: string;
  configuredOrigin?: string;
}

export const resolveAuthOrigin = ({
  isDevelopment,
  currentOrigin,
  configuredOrigin,
}: AuthOriginRuntime) => {
  const candidate = isDevelopment
    ? currentOrigin
    : (configuredOrigin?.trim() || PRODUCTION_AUTH_ORIGIN);

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Auth redirect origin must be a valid absolute URL.');
  }

  if (isDevelopment) {
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
      throw new Error('Development auth redirect origin must use HTTPS or local HTTP.');
    }
  } else if (url.protocol !== 'https:') {
    throw new Error('Production auth redirect origin must use HTTPS.');
  }

  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Auth redirect origin must not contain credentials, path, query, or fragment.');
  }

  return url.origin;
};

export interface CanonicalFrontendRuntime extends AuthOriginRuntime {
  currentHref: string;
}

export const canonicalFrontendUrl = ({
  isDevelopment,
  currentOrigin,
  currentHref,
  configuredOrigin,
}: CanonicalFrontendRuntime) => {
  if (isDevelopment) return null;
  const canonicalOrigin = resolveAuthOrigin({
    isDevelopment,
    currentOrigin,
    configuredOrigin,
  });
  if (currentOrigin === canonicalOrigin) return null;

  const current = new URL(currentHref);
  return new URL(`${current.pathname}${current.search}${current.hash}`, canonicalOrigin).toString();
};

export const safeAppRedirect = (path: unknown, fallback: string) => {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return fallback;
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith('//')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
};

export const authRedirectUrl = (path: string) => {
  const safePath = safeAppRedirect(path, '');
  if (!safePath || !callbackPaths.has(safePath.split(/[?#]/, 1)[0])) {
    throw new Error('Auth redirects must use an approved callback path.');
  }
  const origin = resolveAuthOrigin({
    isDevelopment: import.meta.env.DEV,
    currentOrigin: window.location.origin,
    configuredOrigin: import.meta.env.VITE_AUTH_REDIRECT_ORIGIN,
  });
  return new URL(safePath, origin).toString();
};

export const clearSensitiveAuthUrl = () => {
  window.history.replaceState(null, document.title, window.location.pathname);
};
