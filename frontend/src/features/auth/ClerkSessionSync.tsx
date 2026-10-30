import { useEffect } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { useAuthStore } from './authStore';
import { getApiClient } from '../../lib/api/client';

interface CurrentUserResponse {
  userId: string;
  email: string;
  role: 'admin' | 'attorney' | 'viewer' | null;
  firmId: string | null;
}

export function ClerkSessionSync() {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setStatus = useAuthStore((state) => state.setStatus);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      clearSession();
      return;
    }

    let isSubscribed = true;

    async function sync() {
      try {
        const token = await getToken();
        if (!token || !isSubscribed) return;

        const context = await getApiClient().requestJson<CurrentUserResponse>('/session-context', {
          headers: { Authorization: `Bearer ${token}` },
          suppressUnauthorizedHandler: true,
        });

        if (!isSubscribed) return;

        if (!context.role || !context.firmId) {
          console.warn('Clerk user has no linked firm membership yet.');
          setStatus('unassigned');
          return;
        }

        setSession(token, {
          id: context.userId,
          email: context.email || user?.primaryEmailAddress?.emailAddress || '',
          fullName: user?.fullName || user?.firstName || 'IPRP User',
          role: context.role,
          firmId: context.firmId,
          emailVerified: true,
        });
      } catch (error) {
        console.warn('Clerk session context resolution error:', error);
        if (isSubscribed) {
          setStatus('unassigned');
        }
      }
    }

    void sync();

    return () => {
      isSubscribed = false;
    };
  }, [isLoaded, isSignedIn, getToken, user, setSession, clearSession, setStatus]);

  return null;
}
