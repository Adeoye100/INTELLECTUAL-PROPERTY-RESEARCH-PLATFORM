import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '../../components/Button';
import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';

const signupSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  company: z.string().min(2, 'Company name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export const SignupScreen: React.FC = () => {
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormValues) => {
    console.log('Signup data:', data);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSuccess(true);
  };

  if (isSuccess) {
    return (
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-risk-low rounded-full flex items-center justify-center text-white">
            <Check size={32} strokeWidth={3} />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-text-primary">Request Submitted</h1>
          <p className="text-text-secondary">
            Your request for access has been received. Our team will review your application and contact you within 24 hours.
          </p>
        </div>
        <Button className="w-full" onClick={() => navigate('/auth/login')}>
          Return to Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text-primary">Request Access</h1>
        <p className="text-text-secondary mt-1">Join the Forge Global brand protection network</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">Full Name</label>
          <input
            {...register('fullName')}
            className="w-full px-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-forge-teal-700 outline-none transition-all"
            placeholder="Jane Smith"
          />
          {errors.fullName && <p className="text-risk-high text-xs mt-1">{errors.fullName.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">Company</label>
          <input
            {...register('company')}
            className="w-full px-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-forge-teal-700 outline-none transition-all"
            placeholder="Legal Partners LLC"
          />
          {errors.company && <p className="text-risk-high text-xs mt-1">{errors.company.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">Email Address</label>
          <input
            {...register('email')}
            type="email"
            className="w-full px-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-forge-teal-700 outline-none transition-all"
            placeholder="jane@company.com"
          />
          {errors.email && <p className="text-risk-high text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-primary mb-1">Password</label>
          <input
            {...register('password')}
            type="password"
            className="w-full px-3 py-2 border border-forge-silver-300 rounded focus:ring-2 focus:ring-forge-teal-700 outline-none transition-all"
            placeholder="••••••••"
          />
          {errors.password && <p className="text-risk-high text-xs mt-1">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Request Access'}
        </Button>
      </form>

      <div className="text-center pt-4 border-t border-forge-silver-100">
        <p className="text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-forge-teal-700 font-bold hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};
