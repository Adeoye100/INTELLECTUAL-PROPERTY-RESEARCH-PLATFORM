import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../types';
import { authErrorMessage, authRequest, toAuthApiError } from './authApi';
import { redeemInvitationForSession } from './invitationRedemption';
import { authRedirectUrl, roleHomePath } from './roleRouting';
import { syncSupabaseSession } from './authStore';

interface InvitationDetails { email: string; firmName: string; role: UserRole; expiresAt: string; }

export function InviteRedemptionScreen() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const statusRef = useRef<HTMLDivElement>(null);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setInvitation(await authRequest<InvitationDetails>(`/auth/invitations/${encodeURIComponent(token)}`)); }
    catch (caught) { setError(authErrorMessage(toAuthApiError(caught))); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { if (error) statusRef.current?.focus(); }, [error]);

  const complete = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
    if (!session) throw new Error('Supabase did not return a session.');
    await redeemInvitationForSession(session, token);
    const user = await syncSupabaseSession(session);
    navigate(roleHomePath(user.role), { replace: true });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!invitation) return;
    setError(null);
    if (mode === 'create' && (fullName.trim().length < 2 || password.length < 8 || password !== confirmPassword)) {
      setError('Enter your name and matching password of at least eight characters.'); return;
    }
    if (mode === 'signin' && password.length < 8) { setError('Enter your existing password.'); return; }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const result = await supabase.auth.signInWithPassword({ email: invitation.email, password });
        if (result.error) throw result.error;
        await complete(result.data.session);
        return;
      }
      const callback = new URL(authRedirectUrl('/auth/verify-email'));
      callback.searchParams.set('invitation', token);
      const result = await supabase.auth.signUp({
        email: invitation.email, password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: callback.toString() },
      });
      if (result.error || !result.data.user || result.data.user.identities?.length === 0) {
        setMode('signin'); setError('An account already exists. Sign in to accept this invitation.'); return;
      }
      if (!result.data.session) {
        navigate(`/auth/verify-email?email=${encodeURIComponent(invitation.email)}&invitation=${encodeURIComponent(token)}`, { replace: true });
        return;
      }
      await complete(result.data.session);
    } catch (caught) { setError(authErrorMessage(toAuthApiError(caught))); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="text-center text-text-secondary" role="status">Checking invitation…</p>;
  if (!invitation) return <div ref={statusRef} tabIndex={-1} className="space-y-4 text-center focus:outline-none" role="alert"><h1 className="text-2xl font-bold text-text-primary">Invitation unavailable</h1><p className="text-text-secondary">{error ?? 'This invitation is unavailable.'}</p><Button onClick={() => void load()}>Retry</Button></div>;
  return <div className="space-y-6"><div className="text-center"><h1 className="text-2xl font-bold text-text-primary">Join {invitation.firmName}</h1><p className="mt-1 text-text-secondary">You are invited as <strong>{invitation.role}</strong> using {invitation.email}. Expires {new Date(invitation.expiresAt).toLocaleString()}.</p><p className="mt-2 text-sm text-text-secondary">Admin manages firm members and settings. Attorney performs firm legal and research work. Viewer has read-only access.</p></div><div className="flex rounded border border-forge-silver-300 p-1"><button type="button" aria-pressed={mode === 'create'} className="flex-1 rounded px-3 py-2 text-sm font-semibold" onClick={() => setMode('create')}>Create account</button><button type="button" aria-pressed={mode === 'signin'} className="flex-1 rounded px-3 py-2 text-sm font-semibold" onClick={() => setMode('signin')}>Sign in to accept invitation</button></div><form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>{mode === 'create' && <label className="block text-sm font-semibold text-text-primary" htmlFor="invite-name">Full name<input id="invite-name" autoFocus autoComplete="name" className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>}<label className="block text-sm font-semibold text-text-primary" htmlFor="invite-email">Invited email<input id="invite-email" value={invitation.email} readOnly className="mt-1 w-full rounded border border-forge-silver-300 bg-surface-base px-3 py-2" /></label><label className="block text-sm font-semibold text-text-primary" htmlFor="invite-password">{mode === 'create' ? 'Create password' : 'Password'}<input id="invite-password" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{mode === 'create' && <label className="block text-sm font-semibold text-text-primary" htmlFor="invite-confirm">Confirm password<input id="invite-confirm" type="password" autoComplete="new-password" className="mt-1 w-full rounded border border-forge-silver-300 px-3 py-2" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>}{error && <p ref={statusRef} tabIndex={-1} className="rounded bg-risk-high/10 p-3 text-sm text-risk-high focus:outline-none" role="alert">{error}</p>}<Button className="w-full" disabled={busy} type="submit">{busy ? 'Completing invitation…' : mode === 'signin' ? 'Sign in and accept invitation' : 'Create account and accept invitation'}</Button></form><Link className="block text-center text-sm font-bold text-accent underline" to="/auth/login">Return to sign in</Link></div>;
}
