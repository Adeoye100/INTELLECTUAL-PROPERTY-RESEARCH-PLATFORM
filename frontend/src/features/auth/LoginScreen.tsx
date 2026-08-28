import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { HourglassLoader } from '../../components/HourglassLoader';
import { supabase } from '../../lib/supabase';
import { AuthApiError, authErrorMessage, toAuthApiError } from './authApi';
import { authRedirectUrl, roleHomePath, safeAppRedirect } from './roleRouting';
import { syncSupabaseSession } from './authStore';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

interface LoginLocationState {
  from?: string;
  reason?: 'authentication-required' | 'session-expired' | 'signed-out' | 'password-updated';
}

const notices: Record<NonNullable<LoginLocationState['reason']>, string> = {
  'authentication-required': 'Sign in to continue to that page.',
  'session-expired': 'Your session expired. Sign in again to continue.',
  'signed-out': 'You have signed out successfully.',
  'password-updated': 'Your password was updated. Sign in with your new password.',
};

export const LoginScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AuthApiError['code'] | null>(null);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const locationState = location.state as LoginLocationState | null;
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (submitError) errorRef.current?.focus();
  }, [submitError]);

  const onSubmit = async (data: LoginFormValues) => {
    setSubmitError(null);
    setErrorCode(null);

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword(data);
      if (error) throw error;
      if (!authData.session) throw new Error('Supabase did not return a session.');
      const user = await syncSupabaseSession(authData.session);

      const destination = user.onboardingRequired
        ? '/dashboard'
        : safeAppRedirect(locationState?.from, roleHomePath(user.role));
      navigate(destination, { replace: true });
    } catch (error) {
      const authError = toAuthApiError(error);
      setSubmitError(authErrorMessage(authError));
      setErrorCode(authError.code);
    }
  };

  const signInWithGoogle = async () => {
    setSubmitError(null);
    setErrorCode(null);
    setIsGoogleRedirecting(true);
    try {
      const next = safeAppRedirect(locationState?.from, '/app');
      const callback = new URL(authRedirectUrl('/auth/callback'));
      callback.searchParams.set('next', next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.toString() },
      });
      if (error) throw error;
    } catch (error) {
      const authError = toAuthApiError(error);
      setSubmitError(authErrorMessage(authError));
      setErrorCode(authError.code);
      setIsGoogleRedirecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary">Sign in</h1>
        <p className="mt-1 text-text-secondary">Access your brand protection console</p>
      </div>

      {locationState?.reason && (
        <p className="rounded border border-forge-teal-700/30 bg-forge-teal-700/10 p-3 text-sm text-text-primary" role="status">
          {notices[locationState.reason]}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="login-email" className="mb-1 block text-sm font-semibold text-text-primary">Email address</label>
          <input
            {...register('email')}
            id="login-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            className="w-full rounded border border-forge-silver-300 px-3 py-2 outline-none transition-all focus:ring-2 focus:ring-accent focus:ring-offset-2"
          />
          {errors.email && <p id="login-email-error" className="mt-1 text-xs text-risk-high">{errors.email.message}</p>}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <label htmlFor="login-password" className="text-sm font-semibold text-text-primary">Password</label>
            <Link to="/auth/forgot-password" className="text-xs font-bold text-accent hover:underline">Forgot password?</Link>
          </div>
          <input
            {...register('password')}
            id="login-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            className="w-full rounded border border-forge-silver-300 px-3 py-2 outline-none transition-all focus:ring-2 focus:ring-accent focus:ring-offset-2"
          />
          {errors.password && <p id="login-password-error" className="mt-1 text-xs text-risk-high">{errors.password.message}</p>}
        </div>

        {submitError && (
          <div ref={errorRef} tabIndex={-1} className="rounded bg-risk-high/10 p-3 text-sm text-risk-high focus:outline-none" role="alert">
            <p>{submitError}</p>
            {errorCode === 'EMAIL_NOT_VERIFIED' && (
              <Link to={`/auth/verify-email?email=${encodeURIComponent(getValues('email'))}`} className="mt-2 inline-block font-bold underline">
                Resend verification email
              </Link>
            )}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <><HourglassLoader decorative className="mr-2 h-5 w-5" />Signing in…</> : errorCode === 'NETWORK_ERROR' ? 'Retry sign in' : 'Sign in'}
        </Button>
      </form>

      <div className="relative" aria-hidden="true">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-forge-silver-100" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-surface-card px-2 text-text-secondary">Or continue with</span></div>
      </div>

      <div>
        <Button type="button" variant="outline" className="w-full" disabled={isGoogleRedirecting} onClick={() => void signInWithGoogle()}>
          <span className="mr-2 font-bold" aria-hidden="true">G</span>
          {isGoogleRedirecting ? <><HourglassLoader decorative className="mr-2 h-5 w-5" />Redirecting…</> : 'Google'}
        </Button>
      </div>

      <div className="border-t border-forge-silver-100 pt-4 text-center">
        <p className="text-sm text-text-secondary">
          Don&apos;t have an account?{' '}
          <Link to="/auth/signup" className="font-bold text-accent hover:underline">Request access</Link>
        </p>
      </div>
    </div>
  );
};
