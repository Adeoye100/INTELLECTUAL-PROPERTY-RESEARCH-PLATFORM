import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as z from 'zod';
import { Button } from '../../components/Button';
import { supabase } from '../../lib/supabase';
import { AuthApiError, authErrorMessage, toAuthApiError } from './authApi';
import { authRedirectUrl, clearSensitiveAuthUrl } from './roleRouting';

const emailSchema = z.object({ email: z.string().trim().email('Enter a valid email address.') });
type EmailValues = z.infer<typeof emailSchema>;

export function PasswordResetRequestScreen() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EmailValues>({ resolver: zodResolver(emailSchema) });

  useEffect(() => { if (sentTo || submitError) statusRef.current?.focus(); }, [sentTo, submitError]);

  const submit = async ({ email }: EmailValues) => {
    setSubmitError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectUrl('/auth/reset-password'),
      });
      if (error) throw error;
      setSentTo(email);
    } catch (error) {
      setSubmitError(authErrorMessage(toAuthApiError(error)));
    }
  };

  if (sentTo) return (
    <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="status">
      <CheckCircle className="mx-auto h-12 w-12 text-forge-teal-700" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-text-primary">Check your email</h1>
      <p className="text-text-secondary">If an account exists for {sentTo}, a password-reset link is on its way.</p>
      <Link to="/auth/login" className="inline-block font-bold text-accent underline">Return to sign in</Link>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center"><h1 className="text-2xl font-bold text-text-primary">Reset your password</h1><p className="mt-1 text-text-secondary">We will email you a secure reset link.</p></div>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="reset-email" className="mb-1 block text-sm font-semibold text-text-primary">Email address</label>
          <input {...register('email')} id="reset-email" type="email" autoComplete="email" autoFocus aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'reset-email-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />
          {errors.email && <p id="reset-email-error" className="mt-1 text-xs text-risk-high">{errors.email.message}</p>}
        </div>
        {submitError && <div ref={statusRef} tabIndex={-1} className="rounded bg-risk-high/10 p-3 text-sm text-risk-high focus:outline-none" role="alert">{submitError}</div>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : submitError ? 'Retry reset request' : 'Send reset link'}</Button>
      </form>
      <Link to="/auth/login" className="block text-center text-sm font-bold text-accent hover:underline">Back to sign in</Link>
    </div>
  );
}

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });
type PasswordValues = z.infer<typeof passwordSchema>;

export function PasswordUpdateScreen() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const recoveryCode = searchParams.get('code') ?? token;
  const navigate = useNavigate();
  const [validating, setValidating] = useState(true);
  const [validationError, setValidationError] = useState<AuthApiError | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const validationPromise = useRef<Promise<void> | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const validateRecoverySession = useCallback(async () => {
    if (!validationPromise.current) {
      validationPromise.current = (async () => {
        if (recoveryCode) {
          try {
            const { error } = await supabase.auth.exchangeCodeForSession(recoveryCode);
            if (error) throw error;
          } finally {
            clearSensitiveAuthUrl();
          }
          return;
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) throw new AuthApiError('EXPIRED_LINK', 'No password-recovery session was found.');
      })();
    }
    try {
      await validationPromise.current;
    } catch (error) {
      validationPromise.current = null;
      throw error;
    }
  }, [recoveryCode]);

  const validate = useCallback(async () => {
    setValidating(true); setValidationError(null);
    try { await validateRecoverySession(); }
    catch (error) { setValidationError(toAuthApiError(error)); }
    finally { setValidating(false); }
  }, [validateRecoverySession]);

  useEffect(() => {
    let active = true;
    void validateRecoverySession()
      .catch((error) => {
        if (active) setValidationError(toAuthApiError(error));
      })
      .finally(() => { if (active) setValidating(false); });
    return () => { active = false; };
  }, [validateRecoverySession]);
  useEffect(() => { if (validationError || submitError) statusRef.current?.focus(); }, [submitError, validationError]);

  const updatePassword = async ({ password }: PasswordValues) => {
    setSubmitError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      navigate('/auth/login', { replace: true, state: { reason: 'password-updated' } });
    } catch (error) { setSubmitError(authErrorMessage(toAuthApiError(error))); }
  };

  if (validating) return <p role="status" className="text-center text-text-secondary">Checking reset link…</p>;
  if (validationError) return (
    <div ref={statusRef} tabIndex={-1} className="space-y-5 text-center focus:outline-none" role="alert">
      <h1 className="text-2xl font-bold text-text-primary">{validationError.code === 'EXPIRED_LINK' ? 'Reset link expired' : 'Could not verify reset link'}</h1>
      <p className="text-text-secondary">{authErrorMessage(validationError)}</p>
      {validationError.code === 'NETWORK_ERROR' && <Button className="w-full" onClick={() => void validate()}>Retry link check</Button>}
      <Link to="/auth/forgot-password" className="inline-block font-bold text-accent underline">Request a new reset link</Link>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center"><h1 className="text-2xl font-bold text-text-primary">Choose a new password</h1><p className="mt-1 text-text-secondary">Use at least eight characters.</p></div>
      <form onSubmit={handleSubmit(updatePassword)} className="space-y-4" noValidate>
        <div><label htmlFor="new-password" className="mb-1 block text-sm font-semibold text-text-primary">New password</label><input {...register('password')} id="new-password" type="password" autoComplete="new-password" autoFocus aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'new-password-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />{errors.password && <p id="new-password-error" className="mt-1 text-xs text-risk-high">{errors.password.message}</p>}</div>
        <div><label htmlFor="confirm-new-password" className="mb-1 block text-sm font-semibold text-text-primary">Confirm new password</label><input {...register('confirmPassword')} id="confirm-new-password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'confirm-new-password-error' : undefined} className="w-full rounded border border-forge-silver-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2" />{errors.confirmPassword && <p id="confirm-new-password-error" className="mt-1 text-xs text-risk-high">{errors.confirmPassword.message}</p>}</div>
        {submitError && <div ref={statusRef} tabIndex={-1} className="rounded bg-risk-high/10 p-3 text-sm text-risk-high focus:outline-none" role="alert">{submitError}</div>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Updating…' : submitError ? 'Retry password update' : 'Update password'}</Button>
      </form>
    </div>
  );
}
