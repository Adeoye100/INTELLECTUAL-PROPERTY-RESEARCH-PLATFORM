import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore';

export function SessionExpiryMonitor() {
  const navigate = useNavigate();
  const expiresAt = useAuthStore((state) => state.expiresAt);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    if (!expiresAt) return;

    const expire = () => {
      clearSession();
      navigate('/auth/login', {
        replace: true,
        state: { reason: 'session-expired' },
      });
    };

    let timer = 0;
    const scheduleExpiryCheck = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        expire();
        return;
      }
      timer = window.setTimeout(scheduleExpiryCheck, Math.min(remaining, 2_147_483_647));
    };
    scheduleExpiryCheck();
    return () => window.clearTimeout(timer);
  }, [clearSession, expiresAt, navigate]);

  return null;
}
