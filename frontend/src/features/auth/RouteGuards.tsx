import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth as useClerkAuth } from '@clerk/react';
import { initializeAuth, useAuthStore } from './authStore';
import type { UserRole } from '../../types';
import { roleHomePath } from './roleRouting';

const isClerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

interface RouteGuardProps {
  children: ReactNode;
}

function ClerkAuthGuard({ children, location }: { children: ReactNode; location: { pathname: string } }) {
  const { isSignedIn, isLoaded, signOut } = useClerkAuth();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const status = useAuthStore((state) => state.status);

  if (status === 'unassigned') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center space-y-4">
        <h2 className="text-xl font-bold text-text-primary">No Organization Membership</h2>
        <p className="text-text-secondary max-w-md">
          Your account is signed in, but is not associated with an existing organization or firm yet.
        </p>
        <div className="flex gap-4 pt-2">
          <Link
            to="/auth/create-organization"
            className="rounded bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90"
          >
            Create Organization
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded border border-forge-silver-300 px-4 py-2 text-text-secondary hover:bg-surface-muted"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!isLoaded || (isSignedIn && (!user || !token))) {
    return <p className="text-center text-text-secondary py-12" role="status">Restoring your session…</p>;
  }

  if (!isSignedIn) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname, reason: 'authentication-required' }} />;
  }

  return <>{children}</>;
}

export function RequireAuthentication({ children }: RouteGuardProps) {
  const location = useLocation();

  if (isClerkEnabled) {
    return <ClerkAuthGuard location={location}>{children}</ClerkAuthGuard>;
  }

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
  if (!role && isClerkEnabled) {
    return <p className="text-center text-text-secondary py-12" role="status">Redirecting to your dashboard…</p>;
  }
  return <Navigate to={role ? roleHomePath(role) : '/auth/login'} replace />;
}

// These guards improve the client experience only. Every protected API endpoint
// must independently validate the authenticated tenant and role on the server.
