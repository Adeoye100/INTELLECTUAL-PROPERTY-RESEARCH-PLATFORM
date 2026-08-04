import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Mail } from 'lucide-react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { AuthApiError, authErrorMessage, authRequest } from './authApi';

export function EmailVerificationScreen() {
  const { token } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const [status, setStatus] = useState<'pending' | 'loading' | 'verified' | 'resent' | 'error'>(token ? 'loading' : 'pending');
  const [error, setError] = useState<AuthApiError | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const verify = useCallback(async () => {
    if (!token) return;
    setStatus('loading'); setError(null);
    try { await authRequest(`/api/auth/verify-email/${token}`); setStatus('verified'); }
    catch (caught) { setError(caught instanceof AuthApiError ? caught : new AuthApiError('UNKNOWN_ERROR', authErrorMessage(caught))); setStatus('error'); }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void authRequest(`/api/auth/verify-email/${token}`)
      .then(() => { if (active) setStatus('verified'); })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof AuthApiError ? caught : new AuthApiError('UNKNOWN_ERROR', authErrorMessage(caught)));
          setStatus('error');
        }
      });
    return () => { active = false; };
  }, [token]);
  useEffect(() => { if (status !== 'loading' && status !== 'pending') statusRef.current?.focus(); }, [status]);

  const resend = async () => {
    setStatus('loading'); setError(null);
    try { await authRequest('/api/auth/verify-email/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); setStatus('resent'); }
    catch (caught) { setError(caught instanceof AuthApiError ? caught : new AuthApiError('UNKNOWN_ERROR', authErrorMessage(caught))); setStatus('error'); }
  };

  if (status === 'loading') return <p role="status" className="text-center text-text-secondary">{token ? 'Verifying email…' : 'Sending verification email…'}</p>;
  if (status === 'verified') return <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="status"><CheckCircle className="mx-auto h-12 w-12 text-forge-teal-700" aria-hidden="true" /><h1 className="text-2xl font-bold text-text-primary">Email verified</h1><p className="text-text-secondary">Your email address is confirmed. You can now sign in.</p><Link to="/auth/login" className="inline-block font-bold text-accent underline">Continue to sign in</Link></div>;
  if (status === 'error') return <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="alert"><h1 className="text-2xl font-bold text-text-primary">{error?.code === 'EXPIRED_LINK' ? 'Verification link expired' : 'Verification failed'}</h1><p className="text-text-secondary">{authErrorMessage(error)}</p>{error?.code === 'NETWORK_ERROR' && token && <Button className="w-full" onClick={() => void verify()}>Retry verification</Button>}<Button variant="outline" className="w-full" onClick={() => void resend()}>Send a new verification email</Button></div>;

  return <div className="space-y-5 text-center"><Mail className="mx-auto h-12 w-12 text-forge-teal-700" aria-hidden="true" /><h1 className="text-2xl font-bold text-text-primary">Check your email</h1><p className="text-text-secondary">Use the verification link sent to {email ?? 'your email address'}. The link expires for your security.</p>{status === 'resent' && <p ref={statusRef} tabIndex={-1} className="rounded bg-forge-teal-700/10 p-3 text-sm text-text-primary focus:outline-none" role="status">A new verification email was sent.</p>}<Button className="w-full" onClick={() => void resend()}>Resend verification email</Button><Link to="/auth/login" className="inline-block font-bold text-accent underline">Return to sign in</Link></div>;
}
