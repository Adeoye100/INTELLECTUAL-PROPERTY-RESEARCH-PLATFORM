import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { initializeAuth, useAuthStore } from './authStore';
import type { UserRole } from '../../types';
import { roleHomePath } from './roleRouting';

interface RouteGuardProps {
  children: ReactNode;
}

export function RequireAuthentication({ children }: RouteGuardProps) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === 'initializing') void initializeAuth();
  }, [status]);

  if (status === 'initializing') return <p className="text-center text-text-secondary" role="status">Restoring your session…</p>;

  if (!user || !token) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname, reason: 'authentication-required' }} />;
  }

  if (user.emailVerified === false) {
    return <Navigate to={`/auth/verify-email?email=${encodeURIComponent(user.email)}`} replace />;
  }

  return children;
}

export function RequireAdmin({ children }: RouteGuardProps) {
  return <RequireRole allowedRoles={['admin']}>{children}</RequireRole>;
}

interface RequireRoleProps extends RouteGuardProps {
  allowedRoles: UserRole[];
}

export function RequireRole({ children, allowedRoles }: RequireRoleProps) {
  const role = useAuthStore((state) => state.user?.role);

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/permission-denied" replace />;
  }

  return children;
}

export function RoleHomeRedirect() {
  const role = useAuthStore((state) => state.user?.role);
  return <Navigate to={role ? roleHomePath(role) : '/auth/login'} replace />;
}

// These guards improve the client experience only. Every protected API endpoint
// must independently validate the authenticated tenant and role on the server.
