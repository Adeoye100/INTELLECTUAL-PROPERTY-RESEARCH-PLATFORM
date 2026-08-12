import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import type { UserRole } from '../../types';
import { supabase } from '../../lib/supabase';
import { getApiConfig } from '../../lib/api/config';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
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

async function resolveRole(accessToken: string): Promise<UserRole | null> {
  const baseUrl = getApiConfig().baseUrl;
  for (const [candidate, path] of [
    ['admin', '/admin/ping'],
    ['attorney', '/attorney/ping'],
    ['viewer', '/viewer/ping'],
  ] as const) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      credentials: 'same-origin',
    });
    if (response.ok) return candidate;
    if (response.status === 401) return null;
    if (response.status !== 403) throw new Error('The service could not load your firm membership.');
  }
  return null;
}

const displayName = (user: User) => {
  const name = user.user_metadata.full_name ?? user.user_metadata.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return user.email?.split('@')[0] || 'Forge user';
};

export async function syncSupabaseSession(
  session: Session,
  roleOverride?: UserRole,
): Promise<AuthenticatedUser> {
  const revision = beginSession(session.access_token);
  const role = roleOverride ?? await resolveRole(session.access_token);
  if (revision !== sessionRevision) throw new Error('A newer authentication state replaced this session.');
  if (!role) {
    useAuthStore.getState().clearSession();
    await supabase.auth.signOut({ scope: 'local' });
    throw new Error('No firm membership is associated with this account. Request access or ask a firm administrator for an invitation.');
  }

  const user: AuthenticatedUser = {
    id: session.user.id,
    email: session.user.email ?? '',
    fullName: displayName(session.user),
    role,
    emailVerified: Boolean(session.user.email_confirmed_at),
    onboardingRequired: session.user.user_metadata.onboarding_required === true,
  };
  useAuthStore.setState({ token: session.access_token, user, status: 'authenticated' });
  return user;
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
