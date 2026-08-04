import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './authStore';

interface RouteGuardProps {
  children: ReactNode;
}

export function RequireAuthentication({ children }: RouteGuardProps) {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);

  if (!user || !token) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export function RequireAdmin({ children }: RouteGuardProps) {
  const user = useAuthStore((state) => state.user);

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// These guards improve the client experience only. Every protected API endpoint
// must independently validate the authenticated tenant and role on the server.
