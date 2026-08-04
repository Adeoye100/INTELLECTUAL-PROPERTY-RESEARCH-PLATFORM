import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '../../components/Button';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, type AuthenticatedUser } from './authStore';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setSubmitError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Sign in failed');

      const session = (await response.json()) as {
        token: string;
        user: AuthenticatedUser;
      };
      setSession(session.token, session.user);

      const destination = (location.state as { from?: string } | null)?.from;
      navigate(destination ?? '/dashboard', { replace: true });
    } catch {
      setSubmitError('Unable to sign in. Check your details and try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary">Sign In</h1>
        <p className="text-text-secondary mt-1">Access your brand protection console</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-semibold text-text-primary mb-1">Email Address</label>
          <input
            {...register('email')}
            id="login-email"
            type="email"
            className="w-full px-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-accent outline-none transition-all"
            placeholder="attorney@company.com"
          />
          {errors.email && <p className="text-risk-high text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-semibold text-text-primary mb-1">Password</label>
          <input
            {...register('password')}
            id="login-password"
            type="password"
            className="w-full px-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-accent outline-none transition-all"
            placeholder="••••••••"
          />
          {errors.password && <p className="text-risk-high text-xs mt-1">{errors.password.message}</p>}
        </div>

        {submitError && (
          <p className="rounded bg-risk-high/10 p-3 text-sm text-risk-high" role="alert">
            {submitError}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <div className="text-center pt-4 border-t border-forge-silver-100">
        <p className="text-sm text-text-secondary">
          Don't have an account?{' '}
          <Link to="/auth/signup" className="text-accent font-bold hover:underline">
            Request Access
          </Link>
        </p>
      </div>
    </div>
  );
};
