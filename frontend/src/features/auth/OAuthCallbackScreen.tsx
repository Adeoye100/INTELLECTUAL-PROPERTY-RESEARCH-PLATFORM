import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AuthApiError, authErrorMessage, toAuthApiError } from './authApi';
import { authRedirectUrl, clearSensitiveAuthUrl, roleHomePath, safeAppRedirect } from './roleRouting';
import { syncSupabaseSession } from './authStore';

// A route remount (including Strict Mode's development effect replay) must not
// spend a PKCE code twice while the original exchange is still in flight.
const pendingCodeExchanges = new Map<string, Promise<Session>>();

const consumedCodeError = (error: unknown) => {
  const value = error && typeof error === 'object' ? error as { code?: string; message?: string } : {};
  return /flow_state_not_found|already.*(?:used|exchanged)|code.*(?:used|exchanged)/i.test(
    `${value.code ?? ''} ${value.message ?? ''}`,
  );
};

async function exchangeCodeOnce(code: string): Promise<Session> {
  const pending = pendingCodeExchanges.get(code);
  if (pending) return pending;

  const exchange = (async () => {
    const result = await supabase.auth.exchangeCodeForSession(code);
    if (!result.error && result.data.session) return result.data.session;

    // A previous mounted callback may already have exchanged this single-use
    // code. In that case, a persisted Supabase session is authoritative.
    if (result.error) {
      const existing = await supabase.auth.getSession();
      if (consumedCodeError(result.error) && !existing.error && existing.data.session) {
        return existing.data.session;
      }
    }
    if (result.error) throw result.error;
    throw new Error('Supabase did not return a session for this sign-in.');
  })();
  pendingCodeExchanges.set(code, exchange);
  void exchange.finally(() => pendingCodeExchanges.delete(code)).catch(() => undefined);
  return exchange;
}

export function OAuthCallbackScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<AuthApiError | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const exchangeStarted = useRef(false);

  const completeSignIn = useCallback(async () => {
    if (searchParams.get('error_description')) {
      throw new Error('Authentication provider rejected the sign-in request.');
    }

    const code = searchParams.get('code');
    const requestedDestination = searchParams.get('next');
    let session: Session | null;

    if (code) {
      session = await exchangeCodeOnce(code);
    } else {
      const result = await supabase.auth.getSession();
      if (result.error) throw result.error;
      session = result.data.session;
    }
    if (!session) throw new Error('Supabase did not return a session for this sign-in.');

    // The exchange has succeeded, so no route remount can see or reuse the
    // sensitive authorization code. Keep the app session for a safe retry if
    // membership synchronization itself fails.
    clearSensitiveAuthUrl();
    const user = await syncSupabaseSession(session);
    const destination = safeAppRedirect(requestedDestination, roleHomePath(user.role));
    navigate(destination === '/app' ? roleHomePath(user.role) : destination, { replace: true });
  }, [navigate, searchParams]);

  const handleFailure = useCallback(async (failure: unknown) => {
    const authError = toAuthApiError(failure);
    // `syncSupabaseSession` records a token-free diagnostic before this UI
    // receives a failure. Never render the original provider/API error.
    setError(authError);
    if (authError.code === 'SESSION_EXPIRED') {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
  }, []);

  const retry = useCallback(async () => {
    setError(null);
    const next = safeAppRedirect(searchParams.get('next'), '/app');
    const callback = new URL(authRedirectUrl('/auth/callback'));
    callback.searchParams.set('next', next);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.toString() },
      });
      if (oauthError) throw oauthError;
    } catch (failure) {
      await handleFailure(failure);
    }
  }, [handleFailure, searchParams]);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;
    void completeSignIn().catch(handleFailure);
  }, [completeSignIn, handleFailure]);

  useEffect(() => {
    if (error) statusRef.current?.focus();
  }, [error]);

  if (!error) {
    return <p className="text-center text-text-secondary" role="status">Completing sign in…</p>;
  }

  const retryable = error.code !== 'SESSION_EXPIRED';
  return (
    <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="alert">
      <AlertTriangle className="mx-auto h-12 w-12 text-risk-medium" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-text-primary">Could not complete sign in</h1>
      <p className="text-text-secondary">{authErrorMessage(error)}</p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {retryable && <button type="button" onClick={() => void retry()} className="font-bold text-accent underline">Try again</button>}
        <Link to="/auth/login" className="inline-block font-bold text-accent underline">Return to sign in</Link>
      </div>
    </div>
  );
}
