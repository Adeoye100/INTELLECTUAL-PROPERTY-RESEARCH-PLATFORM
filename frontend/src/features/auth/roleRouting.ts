import type { UserRole } from '../../types';

export const roleHomePath = (role: UserRole) => {
  if (role === 'admin') return '/admin';
  if (role === 'viewer') return '/portfolio';
  return '/dashboard';
};

export const safeAppRedirect = (path: unknown, fallback: string) =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : fallback;

export const authRedirectUrl = (path: string) => new URL(path, window.location.origin).toString();
