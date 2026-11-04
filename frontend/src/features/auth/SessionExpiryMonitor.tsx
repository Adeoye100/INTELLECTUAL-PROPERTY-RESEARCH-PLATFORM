import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore';
import { SESSION_EXPIRED_EVENT } from '../../lib/api/client';
import { supabase } from '../../lib/supabase';
import { appQueryClient } from '../../lib/queryClient';

export function SessionExpiryMonitor() {
  const navigate = useNavigate();
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (typeof window !== 'undefined' && (window as unknown as { Clerk?: { signOut: () => Promise<void> } }).Clerk?.signOut) {
        void (window as unknown as { Clerk: { signOut: () => Promise<void> } }).Clerk.signOut().catch(() => undefined);
      }
      appQueryClient.clear();
      clearSession();
      void supabase.auth.signOut({ scope: 'local' });
      navigate('/auth/login', {
        replace: true,
        state: { reason: 'session-expired' },
      });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleUnauthorized);
  }, [clearSession, navigate]);

  return null;
}
