import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import type { UserRole } from '../../types';
import { supabase } from '../../lib/supabase';
import { getApiClient } from '../../lib/api/client';
import {
  AuthSynchronizationError,
  type AuthSynchronizationDiagnostic,
  toAuthSynchronizationError,
} from './authApi';

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
let lastSynchronizationDiagnostic: AuthSynchronizationDiagnostic | null = null;

export const AUTH_SYNCHRONIZATION_DIAGNOSTIC_EVENT = 'forge:auth-synchronization-diagnostic';

export function getLastAuthSynchronizationDiagnostic() {
  return lastSynchronizationDiagnostic;
}

function recordSynchronizationDiagnostic(diagnostic: AuthSynchronizationDiagnostic) {
  lastSynchronizationDiagnostic = Object.freeze({ ...diagnostic });
  // Support tooling can observe this event without access to a session token,
  // server message, OAuth code, or user identifier.
  window.dispatchEvent(new CustomEvent(AUTH_SYNCHRONIZATION_DIAGNOSTIC_EVENT, {
    detail: lastSynchronizationDiagnostic,
  }));
}

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
    suppressUnauthorizedHandler: true,
  });
}

const displayName = (user: User) => {
  const name = user.user_metadata.full_name ?? user.user_metadata.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return user.email?.split('@')[0] || 'Forge user';
};

async function synchronizeSupabaseSession(session: Session): Promise<AuthenticatedUser> {
  try {
    const revision = beginSession(session.access_token);
    if (revision !== sessionRevision) {
      throw new AuthSynchronizationError('STALE_SESSION', 'A newer authentication state replaced this session.', {
        stage: 'resolve-current-user', responseCode: 'STALE_SESSION',
      });
    }

    let currentUser: CurrentUserResponse;
    try {
      currentUser = await resolveCurrentUser(session.access_token);
    } catch (error) {
      throw toAuthSynchronizationError(error, 'resolve-current-user');
    }
    if (revision !== sessionRevision) {
      throw new AuthSynchronizationError('STALE_SESSION', 'A newer authentication state replaced this session.', {
        stage: 'resolve-current-user', responseCode: 'STALE_SESSION',
      });
    }
    if (!isUserRole(currentUser.role) || typeof currentUser.firmId !== 'string' || !currentUser.firmId) {
      throw new AuthSynchronizationError('FIRM_MEMBERSHIP_MISSING', 'Firm membership is missing.', {
        stage: 'role-routing', responseCode: 'FIRM_MEMBERSHIP_MISSING',
      });
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
  } catch (error) {
    const synchronizationError = error instanceof AuthSynchronizationError
      ? error
      : toAuthSynchronizationError(error, 'resolve-current-user');
    recordSynchronizationDiagnostic(synchronizationError.diagnostic);
    throw synchronizationError;
  }
}

function isMissingMembershipError(error: unknown) {
  return error instanceof AuthSynchronizationError && error.diagnostic.responseCode === 'FIRM_MEMBERSHIP_MISSING';
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
      void syncSupabaseSession(session).catch((error) => {
        if (!isMissingMembershipError(error)) useAuthStore.getState().clearSession();
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
