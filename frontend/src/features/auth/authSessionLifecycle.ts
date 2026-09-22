import type { Session, User } from '@supabase/supabase-js';
import type { UserRole } from '../../types';
import {
  AuthSynchronizationError,
  type AuthSynchronizationDiagnostic,
  discardSupabaseSession,
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

interface CurrentUserResponse {
  userId: string;
  email: string;
  role: UserRole | null;
  firmId: string | null;
}

interface SupabaseAuthClient {
  auth: {
    onAuthStateChange: (callback: (event: string, session: Session | null) => void) => unknown;
    getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>;
  };
}

interface SessionStateWriter {
  setAuthenticated: (token: string, user: AuthenticatedUser) => void;
  clear: () => void;
}

interface AuthSessionLifecycleOptions {
  supabaseClient: SupabaseAuthClient;
  resolveCurrentUser: (accessToken: string) => Promise<CurrentUserResponse>;
  state: SessionStateWriter;
  diagnosticTarget?: Window;
}

export const AUTH_SYNCHRONIZATION_DIAGNOSTIC_EVENT = 'forge:auth-synchronization-diagnostic';

const isUserRole = (role: unknown): role is UserRole =>
  role === 'admin' || role === 'attorney' || role === 'viewer';

const displayName = (user: User) => {
  const name = user.user_metadata.full_name ?? user.user_metadata.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return user.email?.split('@')[0] || 'Forge user';
};

function staleSessionError() {
  return new AuthSynchronizationError('STALE_SESSION', 'A newer authentication state replaced this session.', {
    stage: 'resolve-current-user', responseCode: 'STALE_SESSION',
  });
}

/** Owns the browser session lifecycle behind one testable interface. */
export class AuthSessionLifecycle {
  private sessionRevision = 0;
  private activeAccessToken: string | null = null;
  private readonly sessionSynchronizations = new Map<string, Promise<AuthenticatedUser>>();
  private lastSynchronizationDiagnostic: AuthSynchronizationDiagnostic | null = null;
  private initialization: Promise<void> | null = null;
  private listenerInstalled = false;
  private readonly options: AuthSessionLifecycleOptions;

  constructor(options: AuthSessionLifecycleOptions) {
    this.options = options;
  }

  getLastDiagnostic() {
    return this.lastSynchronizationDiagnostic;
  }

  adoptSession(accessToken: string) {
    if (this.activeAccessToken !== accessToken) {
      this.activeAccessToken = accessToken;
      this.sessionRevision += 1;
    }
    return this.sessionRevision;
  }

  clearSession() {
    this.activeAccessToken = null;
    this.sessionRevision += 1;
    this.options.state.clear();
  }

  private recordDiagnostic(diagnostic: AuthSynchronizationDiagnostic) {
    this.lastSynchronizationDiagnostic = Object.freeze({ ...diagnostic });
    // Support tooling can observe this event without access to a session token,
    // server message, OAuth code, or user identifier.
    this.options.diagnosticTarget?.dispatchEvent(new CustomEvent(AUTH_SYNCHRONIZATION_DIAGNOSTIC_EVENT, {
      detail: this.lastSynchronizationDiagnostic,
    }));
  }

  private assertCurrent(revision: number) {
    if (revision !== this.sessionRevision) throw staleSessionError();
  }

  private async resolve(session: Session): Promise<AuthenticatedUser> {
    const revision = this.adoptSession(session.access_token);
    await Promise.resolve();
    this.assertCurrent(revision);

    let currentUser: CurrentUserResponse;
    try {
      currentUser = await this.options.resolveCurrentUser(session.access_token);
    } catch (error) {
      throw toAuthSynchronizationError(error, 'resolve-current-user');
    }
    this.assertCurrent(revision);

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
    this.options.state.setAuthenticated(session.access_token, user);
    return user;
  }

  sync(session: Session): Promise<AuthenticatedUser> {
    const existing = this.sessionSynchronizations.get(session.access_token);
    if (existing) return existing;

    const synchronization = this.resolve(session).catch((error) => {
      const synchronizationError = error instanceof AuthSynchronizationError
        ? error
        : toAuthSynchronizationError(error, 'resolve-current-user');
      this.recordDiagnostic(synchronizationError.diagnostic);
      throw synchronizationError;
    });
    this.sessionSynchronizations.set(session.access_token, synchronization);
    void synchronization.then(
      () => { this.sessionSynchronizations.delete(session.access_token); },
      () => { this.sessionSynchronizations.delete(session.access_token); },
    );
    return synchronization;
  }

  private async handleInitializationFailure(error: unknown) {
    await discardSupabaseSession(error);
    this.clearSession();
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;

    if (!this.listenerInstalled) {
      this.listenerInstalled = true;
      this.options.supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          this.clearSession();
          return;
        }
        if (event === 'INITIAL_SESSION') return;
        void this.sync(session).catch(() => this.clearSession());
      });
    }

    this.initialization = this.options.supabaseClient.auth.getSession().then(async ({ data, error }) => {
      if (error || !data.session) {
        this.clearSession();
        return;
      }
      await this.sync(data.session);
    }).catch((error) => this.handleInitializationFailure(error));
    return this.initialization;
  }
}
