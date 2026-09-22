import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { getApiClient } from '../../lib/api/client';
import {
  AuthSessionLifecycle,
  type AuthenticatedUser,
} from './authSessionLifecycle';

export type { AuthenticatedUser } from './authSessionLifecycle';
export { AUTH_SYNCHRONIZATION_DIAGNOSTIC_EVENT } from './authSessionLifecycle';

interface AuthState {
  token: string | null;
  user: AuthenticatedUser | null;
  status: 'initializing' | 'authenticated' | 'unauthenticated';
  setSession: (token: string, user: AuthenticatedUser, expiresAt?: number) => void;
  clearSession: () => void;
}

interface CurrentUserResponse {
  userId: string;
  email: string;
  role: AuthenticatedUser['role'] | null;
  firmId: string | null;
}

async function resolveCurrentUser(accessToken: string): Promise<CurrentUserResponse> {
  return getApiClient().requestJson<CurrentUserResponse>('/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    suppressUnauthorizedHandler: true,
  });
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  status: 'initializing',
  // Kept as a test/development convenience; production sessions enter through syncSupabaseSession.
  setSession: (token, user) => {
    sessionLifecycle.adoptSession(token);
    set({ token, user, status: 'authenticated' });
  },
  clearSession: () => sessionLifecycle.clearSession(),
}));

const sessionLifecycle = new AuthSessionLifecycle({
  supabaseClient: supabase,
  resolveCurrentUser,
  state: {
    setAuthenticated: (token, user) => useAuthStore.setState({ token, user, status: 'authenticated' }),
    clear: () => useAuthStore.setState({ token: null, user: null, status: 'unauthenticated' }),
  },
  diagnosticTarget: typeof window === 'undefined' ? undefined : window,
});

export function getLastAuthSynchronizationDiagnostic() {
  return sessionLifecycle.getLastDiagnostic();
}

export function syncSupabaseSession(session: Session): Promise<AuthenticatedUser> {
  return sessionLifecycle.sync(session);
}

export function initializeAuth(): Promise<void> {
  return sessionLifecycle.initialize();
}
