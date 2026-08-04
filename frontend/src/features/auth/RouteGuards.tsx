import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './authStore';
import type { UserRole } from '../../types';
import { isSessionExpired } from './authStore';
import { roleHomePath } from './roleRouting';

interface RouteGuardProps {
  children: ReactNode;
}

function ExpiredSessionRedirect({ from }: { from: string }) {
  const clearSession = useAuthStore((state) => state.clearSession);
  useEffect(() => clearSession(), [clearSession]);
  return <Navigate to="/auth/login" replace state={{ from, reason: 'session-expired' }} />;
}

export function RequireAuthentication({ children }: RouteGuardProps) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const expiresAt = useAuthStore((state) => state.expiresAt);

  if (user && token && isSessionExpired(expiresAt)) {
    return <ExpiredSessionRedirect from={location.pathname} />;
  }

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
