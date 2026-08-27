import type { UserRole } from '../../types';

export const roleHomePath = (role: UserRole) => {
  // Billing, search, watches, and the legacy portfolio UI remain unavailable
  // in the initial deployment profile. Every role therefore lands on the
  // server-backed dashboard after authentication.
  void role;
  return '/dashboard';
};

const callbackPaths = new Set(['/auth/callback', '/auth/reset-password', '/auth/verify-email']);

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
  return new URL(safePath, window.location.origin).toString();
};

export const clearSensitiveAuthUrl = () => {
  window.history.replaceState(null, document.title, window.location.pathname);
};
