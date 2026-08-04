import type { UserRole } from '../../types';

export const roleHomePath = (role: UserRole) => {
  if (role === 'admin') return '/admin';
  if (role === 'viewer') return '/portfolio';
  return '/dashboard';
};
