import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { authErrorMessage, toAuthApiError } from './authApi';
import { roleHomePath, safeAppRedirect } from './roleRouting';
import { syncSupabaseSession } from './authStore';

export function OAuthCallbackScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    const completeSignIn = async () => {
      const providerError = searchParams.get('error_description');
      if (providerError) throw new Error(providerError);

      const code = searchParams.get('code');
      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.getSession();
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error('Supabase did not return a session for this sign-in.');

      const user = await syncSupabaseSession(result.data.session);
      const destination = safeAppRedirect(searchParams.get('next'), roleHomePath(user.role));
      navigate(destination === '/app' ? roleHomePath(user.role) : destination, { replace: true });
    };

    void completeSignIn().catch(async (error) => {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setErrorMessage(authErrorMessage(toAuthApiError(error)));
    });
  }, [navigate, searchParams]);

  useEffect(() => {
    if (errorMessage) statusRef.current?.focus();
  }, [errorMessage]);

  if (!errorMessage) {
    return <p className="text-center text-text-secondary" role="status">Completing sign in…</p>;
  }

  return (
    <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="alert">
      <AlertTriangle className="mx-auto h-12 w-12 text-risk-medium" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-text-primary">Could not complete sign in</h1>
      <p className="text-text-secondary">{errorMessage}</p>
      <Link to="/auth/login" className="inline-block font-bold text-accent underline">Return to sign in</Link>
    </div>
  );
}
