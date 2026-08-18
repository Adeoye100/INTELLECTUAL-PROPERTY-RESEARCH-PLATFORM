import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import type { UserRole } from '../../types';
import { supabase } from '../../lib/supabase';
import { getApiClient } from '../../lib/api/client';
import { provisionFirmForSignupSession } from './signupProvisioning';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  firmId: string;
  emailVerified?: boolean;
  onboardingRequired?: boolean;
}

interface AuthState {
  token: string | null;
  user: AuthenticatedUser | null;
  status: 'initializing' | 'authenticated' | 'unauthenticated';
  setSession: (token: string, user: AuthenticatedUser, expiresAt?: number) => void;
  clearSession: () => void;
}

let sessionRevision = 0;
let activeAccessToken: string | null = null;
const sessionSynchronizations = new Map<string, Promise<AuthenticatedUser>>();

const beginSession = (accessToken: string) => {
  if (activeAccessToken !== accessToken) {
    activeAccessToken = accessToken;
    sessionRevision += 1;
  }
  return sessionRevision;
};

const endSession = () => {
  activeAccessToken = null;
  sessionRevision += 1;
};

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  status: 'initializing',
  // Kept as a test/development convenience; production sessions enter through syncSupabaseSession.
  setSession: (token, user) => {
    beginSession(token);
    set({ token, user, status: 'authenticated' });
  },
  clearSession: () => {
    endSession();
    set({ token: null, user: null, status: 'unauthenticated' });
  },
}));

interface CurrentUserResponse {
  userId: string;
  email: string;
  role: UserRole | null;
  firmId: string | null;
}

const isUserRole = (role: unknown): role is UserRole =>
  role === 'admin' || role === 'attorney' || role === 'viewer';

async function resolveCurrentUser(accessToken: string): Promise<CurrentUserResponse> {
  return getApiClient().requestJson<CurrentUserResponse>('/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

const displayName = (user: User) => {
  const name = user.user_metadata.full_name ?? user.user_metadata.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return user.email?.split('@')[0] || 'Forge user';
};

async function synchronizeSupabaseSession(session: Session): Promise<AuthenticatedUser> {
  const revision = beginSession(session.access_token);
  await provisionFirmForSignupSession(session);
  if (revision !== sessionRevision) throw new Error('A newer authentication state replaced this session.');
  const currentUser = await resolveCurrentUser(session.access_token);
  if (revision !== sessionRevision) throw new Error('A newer authentication state replaced this session.');
  if (!isUserRole(currentUser.role) || typeof currentUser.firmId !== 'string' || !currentUser.firmId) {
    useAuthStore.getState().clearSession();
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('No firm membership is associated with this account. Request access or ask a firm administrator for an invitation.');
  }

  const user: AuthenticatedUser = {
    id: currentUser.userId,
    email: currentUser.email,
    fullName: displayName(session.user),
    role: currentUser.role,
    firmId: currentUser.firmId,
    emailVerified: Boolean(session.user.email_confirmed_at),
    onboardingRequired: session.user.user_metadata.onboarding_required === true,
  };
  useAuthStore.setState({ token: session.access_token, user, status: 'authenticated' });
  return user;
}

export function syncSupabaseSession(session: Session): Promise<AuthenticatedUser> {
  const existing = sessionSynchronizations.get(session.access_token);
  if (existing) return existing;

  const synchronization = synchronizeSupabaseSession(session);
  sessionSynchronizations.set(session.access_token, synchronization);
  void synchronization.then(
    () => { sessionSynchronizations.delete(session.access_token); },
    () => { sessionSynchronizations.delete(session.access_token); },
  );
  return synchronization;
}

let initialization: Promise<void> | null = null;
let listenerInstalled = false;

export function initializeAuth(): Promise<void> {
  if (initialization) return initialization;

  if (!listenerInstalled) {
    listenerInstalled = true;
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        useAuthStore.getState().clearSession();
        return;
      }
      if (event === 'INITIAL_SESSION') return;
      void syncSupabaseSession(session).catch(() => {
        useAuthStore.getState().clearSession();
      });
    });
  }

  initialization = supabase.auth.getSession().then(async ({ data, error }) => {
    if (error || !data.session) {
      useAuthStore.getState().clearSession();
      return;
    }
    await syncSupabaseSession(data.session);
  }).catch(() => {
    useAuthStore.getState().clearSession();
  });
  return initialization;
}
