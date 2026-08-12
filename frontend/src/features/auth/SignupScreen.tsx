import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { supabase } from '../../lib/supabase';
import { AuthApiError, authErrorMessage, authRequest, toAuthApiError } from './authApi';
import { syncSupabaseSession } from './authStore';
import { authRedirectUrl, roleHomePath } from './roleRouting';

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.'),
  email: z.string().trim().email('Enter a valid email address.'),
  company: z.string().trim().min(2, 'Enter your company or firm name.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export const SignupScreen: React.FC = () => {
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AuthApiError['code'] | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  useEffect(() => {
    if (submitError || isSuccess) statusRef.current?.focus();
  }, [isSuccess, submitError]);

  const onSubmit = async (data: SignupFormValues) => {
    setSubmitError(null);
    setErrorCode(null);
    try {
      // The existing backend transaction remains the only firm/local-user
      // provisioning path; Supabase remains the sole session authority.
      await authRequest('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const { data: authData, error: signupError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            onboarding_required: true,
          },
          emailRedirectTo: authRedirectUrl('/auth/verify-email'),
        },
      });
      if (signupError) throw signupError;
      if (!authData.user || authData.user.identities?.length === 0) {
        throw new AuthApiError('DUPLICATE_ACCOUNT', 'An account already exists.');
      }

      if (authData.session) {
        const user = await syncSupabaseSession(authData.session, 'admin');
        navigate(roleHomePath(user.role), { replace: true });
        return;
      }
      setIsSuccess(true);
    } catch (error) {
      const authError = toAuthApiError(error);
      setSubmitError(authErrorMessage(authError));
      setErrorCode(authError.code);
    }
  };

  if (isSuccess) {
    return (
      <div ref={statusRef} tabIndex={-1} className="space-y-6 text-center focus:outline-none" role="status">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-risk-low text-white">
            <Check size={32} strokeWidth={3} aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-text-primary">Verify your email</h1>
          <p className="text-text-secondary">We sent a verification link to {getValues('email')}. Open it before signing in.</p>
        </div>
        <Link to={`/auth/verify-email?email=${encodeURIComponent(getValues('email'))}`} className="inline-flex w-full justify-center rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          View verification options
        </Link>
      </div>
    );
  }

  const fields: Array<{ name: keyof SignupFormValues; label: string; type: string; autoComplete: string }> = [
    { name: 'fullName', label: 'Full name', type: 'text', autoComplete: 'name' },
    { name: 'company', label: 'Company or firm', type: 'text', autoComplete: 'organization' },
    { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary">Request access</h1>
        <p className="mt-1 text-text-secondary">Create your Forge Global account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {fields.map((field) => {
          const error = errors[field.name];
          const id = `signup-${field.name}`;
          return (
            <div key={field.name}>
              <label htmlFor={id} className="mb-1 block text-sm font-semibold text-text-primary">{field.label}</label>
              <input
                {...register(field.name)}
                id={id}
                type={field.type}
                autoComplete={field.autoComplete}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
                className="w-full rounded border border-forge-silver-300 px-3 py-2 outline-none transition-all focus:ring-2 focus:ring-accent focus:ring-offset-2"
              />
              {error && <p id={`${id}-error`} className="mt-1 text-xs text-risk-high">{error.message}</p>}
            </div>
          );
        })}

        {submitError && (
          <div ref={statusRef} tabIndex={-1} className="rounded bg-risk-high/10 p-3 text-sm text-risk-high focus:outline-none" role="alert">
            <p>{submitError}</p>
            {errorCode === 'DUPLICATE_ACCOUNT' && (
              <div className="mt-2 flex gap-3">
                <Link to="/auth/login" className="font-bold underline">Sign in</Link>
                <Link to="/auth/forgot-password" className="font-bold underline">Reset password</Link>
              </div>
            )}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : errorCode === 'NETWORK_ERROR' ? 'Retry request' : 'Request access'}
        </Button>
      </form>

      <div className="border-t border-forge-silver-100 pt-4 text-center">
        <p className="text-sm text-text-secondary">Already have an account? <Link to="/auth/login" className="font-bold text-accent hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
};
