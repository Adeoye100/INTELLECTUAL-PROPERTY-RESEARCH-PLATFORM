import { useEffect, useRef } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { roleHomePath } from './roleRouting';
import { useAuthStore } from './authStore';

export function PermissionDeniedScreen() {
  const role = useAuthStore((state) => state.user?.role);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section className="mx-auto max-w-xl rounded-lg border border-risk-medium bg-surface-card p-8 text-center" aria-labelledby="permission-heading">
      <LockKeyhole className="mx-auto mb-4 h-10 w-10 text-risk-medium" aria-hidden="true" />
      <h1 id="permission-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-text-primary focus:outline-none">
        Permission denied
      </h1>
      <p className="mt-3 text-text-secondary">
        Your {role ?? 'current'} role does not allow access to this page. Ask a firm administrator if your responsibilities have changed.
      </p>
      <Link
        to={role ? roleHomePath(role) : '/auth/login'}
        className="mt-6 inline-flex rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        Return to your home page
      </Link>
    </section>
  );
}
