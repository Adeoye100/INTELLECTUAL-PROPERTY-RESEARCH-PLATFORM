import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../../components/Button';
import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../types';
import { AuthApiError, authErrorMessage, authRequest, toAuthApiError } from './authApi';
import { authRedirectUrl, roleHomePath } from './roleRouting';
import { syncSupabaseSession } from './authStore';

interface InvitationDetails {
  email: string;
  firmName: string;
  role: UserRole;
}

const acceptanceSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

type AcceptanceValues = z.infer<typeof acceptanceSchema>;

export function InviteAcceptanceScreen() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loadError, setLoadError] = useState<AuthApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptanceValues>({ resolver: zodResolver(acceptanceSchema) });

  const loadInvitation = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const details = await authRequest<InvitationDetails>(`/auth/invitations/${token ?? ''}`);
      setInvitation(details);
    } catch (error) {
      setLoadError(error instanceof AuthApiError ? error : new AuthApiError('UNKNOWN_ERROR', authErrorMessage(error)));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;
    void authRequest<InvitationDetails>(`/auth/invitations/${token ?? ''}`)
      .then((details) => { if (active) setInvitation(details); })
      .catch((error) => {
        if (active) setLoadError(error instanceof AuthApiError ? error : new AuthApiError('UNKNOWN_ERROR', authErrorMessage(error)));
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    if (loadError || submitError) statusRef.current?.focus();
  }, [loadError, submitError]);

  const acceptInvitation = async (values: AcceptanceValues) => {
    setSubmitError(null);
    try {
      await authRequest(`/auth/invitations/${token ?? ''}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: values.fullName, password: values.password }),
      });

      const credentials = { email: invitation!.email, password: values.password };
      const { data: signupData, error: signupError } = await supabase.auth.signUp({
        ...credentials,
        options: {
          data: {
            full_name: values.fullName,
            onboarding_required: true,
          },
          emailRedirectTo: authRedirectUrl('/auth/verify-email'),
        },
      });

      let authData = signupData;
      if (signupError || authData.user?.identities?.length === 0) {
        const signIn = await supabase.auth.signInWithPassword(credentials);
        if (signIn.error) throw signupError ?? signIn.error;
        authData = signIn.data;
      }

      if (!authData.session) {
        navigate(`/auth/verify-email?email=${encodeURIComponent(invitation!.email)}`, { replace: true });
        return;
      }
      const user = await syncSupabaseSession(authData.session, invitation!.role);
      navigate(user.onboardingRequired ? '/dashboard' : roleHomePath(user.role), { replace: true });
    } catch (error) {
      setSubmitError(authErrorMessage(toAuthApiError(error)));
    }
  };

  if (isLoading) return <p className="text-center text-text-secondary" role="status">Checking invitation…</p>;

  if (loadError) {
    const retryable = loadError.code === 'NETWORK_ERROR' || loadError.code === 'UNKNOWN_ERROR';
    return (
      <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="alert">
        <AlertTriangle className="mx-auto h-12 w-12 text-risk-medium" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {loadError.code === 'EXPIRED_LINK' ? 'Invitation expired' : loadError.code === 'SEAT_LIMIT' ? 'No seat available' : loadError.code === 'DUPLICATE_ACCOUNT' ? 'Account already exists' : loadError.code === 'PERMISSION_DENIED' ? 'Invitation unavailable' : 'Could not load invitation'}
          </h1>
          <p className="mt-2 text-text-secondary">{authErrorMessage(loadError)}</p>
        </div>
        {retryable && <Button className="w-full" onClick={() => void loadInvitation()}>Retry invitation</Button>}
        {loadError.code === 'DUPLICATE_ACCOUNT' && <Link to="/auth/login" className="inline-block font-bold text-accent underline">Sign in to your account</Link>}
        {loadError.code === 'EXPIRED_LINK' && <Link to="/auth/login" className="inline-block font-bold text-accent underline">Ask your administrator for a new invitation</Link>}
        {loadError.code === 'PERMISSION_DENIED' && <Link to="/auth/login" className="inline-block font-bold text-accent underline">Return to sign in</Link>}
        {loadError.code === 'SEAT_LIMIT' && <p className="text-sm text-text-secondary">A firm Admin must remove a seat or increase the subscription limit.</p>}
      </div>
    );
  }

  if (!invitation) return null;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-forge-teal-700" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-text-primary">Join {invitation.firmName}</h1>
        <p className="mt-1 text-text-secondary">Accept the invitation for {invitation.email} as {invitation.role}.</p>
      </div>
      <form onSubmit={handleSubmit(acceptInvitation)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="invite-full-name" className="mb-1 block text-sm font-semibold text-text-primary">Full name</label>
          <input {...register('fullName')} id="invite-full-name" autoComplete="name" autoFocus aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? 'invite-name-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />
          {errors.fullName && <p id="invite-name-error" className="mt-1 text-xs text-risk-high">{errors.fullName.message}</p>}
        </div>
        <div>
          <label htmlFor="invite-password" className="mb-1 block text-sm font-semibold text-text-primary">Create password</label>
          <input {...register('password')} id="invite-password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'invite-password-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />
          {errors.password && <p id="invite-password-error" className="mt-1 text-xs text-risk-high">{errors.password.message}</p>}
        </div>
        <div>
          <label htmlFor="invite-confirm-password" className="mb-1 block text-sm font-semibold text-text-primary">Confirm password</label>
          <input {...register('confirmPassword')} id="invite-confirm-password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'invite-confirm-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />
          {errors.confirmPassword && <p id="invite-confirm-error" className="mt-1 text-xs text-risk-high">{errors.confirmPassword.message}</p>}
        </div>
        {submitError && <div ref={statusRef} tabIndex={-1} className="rounded bg-risk-high/10 p-3 text-sm text-risk-high focus:outline-none" role="alert">{submitError}</div>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Accepting invitation…' : submitError ? 'Retry acceptance' : 'Accept invitation'}</Button>
      </form>
    </div>
  );
}
