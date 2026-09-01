import type { FormEvent } from "react";
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { supabase } from '../../lib/supabase';
import { authErrorMessage, toAuthApiError } from './authApi';
import { startOrganizationCreation, provisionOrganizationForSession } from './organizationProvisioning';
import { authRedirectUrl, roleHomePath } from './roleRouting';
import { syncSupabaseSession } from './authStore';

const enabled = import.meta.env.VITE_PUBLIC_FIRM_SIGNUP_ENABLED === 'true';

export function CreateOrganizationScreen() {
  const navigate = useNavigate();
  const statusRef = useRef<HTMLDivElement>(null);
  const [fullName, setFullName] = useState('');
  const [firmName, setFirmName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationLink, setVerificationLink] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (fullName.trim().length < 2 || firmName.trim().length < 2 || !email.trim() || password.length < 8) {
      setError('Enter your name, organization name, valid email address, and a password of at least eight characters.');
      return;
    }
    setBusy(true);
    try {
      const intent = await startOrganizationCreation({ email: email.trim(), firmName: firmName.trim() });
      const callback = new URL(authRedirectUrl('/auth/verify-email'));
      callback.searchParams.set('organization_intent', intent.intentToken);
      const result = await supabase.auth.signUp({
        email: email.trim(), password,
        options: {
          data: { full_name: fullName.trim(), forge_signup_firm_name: firmName.trim() },
          emailRedirectTo: callback.toString(),
        },
      });
      if (result.error || !result.data.user || result.data.user.identities?.length === 0) throw result.error ?? new Error('An account already exists.');
      if (result.data.session) {
        await provisionOrganizationForSession(result.data.session, intent.intentToken);
        const user = await syncSupabaseSession(result.data.session);
        navigate(roleHomePath(user.role), { replace: true });
        return;
      }
      setVerificationLink(`/auth/verify-email?email=${encodeURIComponent(email.trim())}&organization_intent=${encodeURIComponent(intent.intentToken)}`);
    } catch (caught) {
      setError(authErrorMessage(toAuthApiError(caught)));
      queueMicrotask(() => statusRef.current?.focus());
    } finally { setBusy(false); }
  };

  if (!enabled) {
    return <div className="space-y-5 text-center"><h1 className="text-2xl font-bold text-text-primary">Create organization</h1><p className="text-text-secondary">Public organization creation is currently unavailable. To join an existing firm, ask a firm Administrator to send an invitation.</p><Link className="font-bold text-accent underline" to="/auth/login">Sign in to accept an invitation</Link></div>;
  }
  if (verificationLink) {
    return <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="status"><h1 className="text-2xl font-bold text-text-primary">Verify your email</h1><p className="text-text-secondary">Confirm your email to create the organization and become its first Administrator.</p><Link className="font-bold text-accent underline" to={verificationLink}>Continue to email verification</Link></div>;
  }
  return <div className="space-y-6"><div className="text-center"><h1 className="text-2xl font-bold text-text-primary">Create a new firm</h1><p className="mt-1 text-text-secondary">You will become the first Administrator of this organization.</p></div><form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate><label className="block text-sm font-semibold text-text-primary" htmlFor="organization-name">Full name<input id="organization-name" autoComplete="name" className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label className="block text-sm font-semibold text-text-primary" htmlFor="firm-name">Firm name<input id="firm-name" autoComplete="organization" className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={firmName} onChange={(event) => setFirmName(event.target.value)} /></label><label className="block text-sm font-semibold text-text-primary" htmlFor="organization-email">Email address<input id="organization-email" type="email" autoComplete="email" className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="block text-sm font-semibold text-text-primary" htmlFor="organization-password">Password<input id="organization-password" type="password" autoComplete="new-password" className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p ref={statusRef} tabIndex={-1} className="rounded bg-risk-high/10 p-3 text-sm text-risk-high focus:outline-none" role="alert">{error}</p>}<Button className="w-full" disabled={busy} type="submit">{busy ? 'Creating organization…' : 'Create organization'}</Button></form><p className="text-center text-sm text-text-secondary">Joining an existing firm? Use the invitation sent by its Administrator.</p></div>;
}
