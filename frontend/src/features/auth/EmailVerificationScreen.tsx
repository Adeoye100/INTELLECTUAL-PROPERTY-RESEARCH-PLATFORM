import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircle, Mail } from 'lucide-react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { supabase } from '../../lib/supabase';
import { AuthApiError, authErrorMessage, toAuthApiError } from './authApi';
import { authRedirectUrl } from './roleRouting';
import { syncSupabaseSession } from './authStore';
import { redeemInvitationForSession } from './invitationRedemption';
import { provisionOrganizationForSession } from './organizationProvisioning';

export function EmailVerificationScreen() {
  const { token } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const confirmationCode = searchParams.get('code') ?? token;
  const email = searchParams.get('email');
  const invitationToken = searchParams.get('invitation');
  const organizationIntentToken = searchParams.get('organization_intent');
  const [status, setStatus] = useState<'pending' | 'loading' | 'verified' | 'resent' | 'error'>(confirmationCode ? 'loading' : 'pending');
  const [error, setError] = useState<AuthApiError | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const exchangePromise = useRef<Promise<Session> | null>(null);
  const exchangedCode = useRef<string | null>(null);
  const exchangedSession = useRef<Session | null>(null);
  const invitationRedeemed = useRef(false);
  const organizationProvisioned = useRef(false);
  const synchronized = useRef(false);

  const exchangeConfirmation = useCallback(async () => {
    if (!confirmationCode) return null;
    if (exchangedCode.current !== confirmationCode) {
      exchangedCode.current = confirmationCode;
      exchangePromise.current = null;
      exchangedSession.current = null;
      invitationRedeemed.current = false;
      organizationProvisioned.current = false;
      synchronized.current = false;
    }
    if (exchangedSession.current) return exchangedSession.current;
    exchangePromise.current ??= supabase.auth.exchangeCodeForSession(confirmationCode).then(({ data, error: exchangeError }) => {
      if (exchangeError) throw exchangeError;
      if (!data.session) throw new Error('Supabase did not return a session for this confirmation.');
      exchangedSession.current = data.session;
      return data.session;
    });
    try {
      return await exchangePromise.current;
    } catch (error) {
      exchangePromise.current = null;
      throw error;
    }
  }, [confirmationCode]);

  const completeVerifiedSession = useCallback(async () => {
    const session = await exchangeConfirmation();
    if (!session) return;
    if (invitationToken && !invitationRedeemed.current) {
      await redeemInvitationForSession(session, invitationToken);
      invitationRedeemed.current = true;
    }
    if (organizationIntentToken && !organizationProvisioned.current) {
      await provisionOrganizationForSession(session, organizationIntentToken);
      organizationProvisioned.current = true;
    }
    if (!synchronized.current) {
      await syncSupabaseSession(session);
      synchronized.current = true;
    }
  }, [exchangeConfirmation, invitationToken, organizationIntentToken]);

  const verify = useCallback(async () => {
    setStatus('loading'); setError(null);
    try { await completeVerifiedSession(); setStatus('verified'); }
    catch (caught) { setError(toAuthApiError(caught)); setStatus('error'); }
  }, [completeVerifiedSession]);

  useEffect(() => {
    if (!confirmationCode) return;
    let active = true;
    void completeVerifiedSession()
      .then(() => { if (active) setStatus('verified'); })
      .catch((caught) => {
        if (active) {
          setError(toAuthApiError(caught));
          setStatus('error');
        }
      });
    return () => { active = false; };
  }, [confirmationCode, completeVerifiedSession]);
  useEffect(() => { if (status !== 'loading' && status !== 'pending') statusRef.current?.focus(); }, [status]);

  const resend = async () => {
    setStatus('loading'); setError(null);
    try {
      if (!email) throw new AuthApiError('UNKNOWN_ERROR', 'Enter your email again from the sign-in screen before requesting another link.');
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: (() => { const callback = new URL(authRedirectUrl('/auth/verify-email')); if (invitationToken) callback.searchParams.set('invitation', invitationToken); if (organizationIntentToken) callback.searchParams.set('organization_intent', organizationIntentToken); return callback.toString(); })() },
      });
      if (resendError) throw resendError;
      setStatus('resent');
    }
    catch (caught) { setError(toAuthApiError(caught)); setStatus('error'); }
  };

  if (status === 'loading') return <p role="status" className="text-center text-text-secondary">{confirmationCode ? 'Verifying email…' : 'Sending verification email…'}</p>;
  if (status === 'verified') return <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="status"><CheckCircle className="mx-auto h-12 w-12 text-forge-teal-700" aria-hidden="true" /><h1 className="text-2xl font-bold text-text-primary">Email verified</h1><p className="text-text-secondary">Your email address is confirmed. Continue to your workspace.</p><Link to="/app" className="inline-block font-bold text-accent underline">Continue to the app</Link></div>;
  if (status === 'error') return <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="alert"><h1 className="text-2xl font-bold text-text-primary">{error?.code === 'EXPIRED_LINK' ? 'Verification link expired' : 'Verification failed'}</h1><p className="text-text-secondary">{authErrorMessage(error)}</p>{error?.code === 'NETWORK_ERROR' && confirmationCode && <Button className="w-full" onClick={() => void verify()}>Retry verification</Button>}<Button variant="outline" className="w-full" onClick={() => void resend()}>Send a new verification email</Button></div>;

  return <div className="space-y-5 text-center"><Mail className="mx-auto h-12 w-12 text-forge-teal-700" aria-hidden="true" /><h1 className="text-2xl font-bold text-text-primary">Check your email</h1><p className="text-text-secondary">Use the verification link sent to {email ?? 'your email address'}. The link expires for your security.</p>{status === 'resent' && <p ref={statusRef} tabIndex={-1} className="rounded bg-forge-teal-700/10 p-3 text-sm text-text-primary focus:outline-none" role="status">A new verification email was sent.</p>}<Button className="w-full" onClick={() => void resend()}>Resend verification email</Button><Link to="/auth/login" className="inline-block font-bold text-accent underline">Return to sign in</Link></div>;
}
