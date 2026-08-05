import { useEffect, useRef } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from '../components/Button';

export function RouteLoading() {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 text-text-secondary" role="status" aria-live="polite">
      <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      Loading page…
    </div>
  );
}

export function RouteErrorScreen() {
  const error = useRouteError();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const status = isRouteErrorResponse(error) ? error.status : undefined;
  const message = isRouteErrorResponse(error)
    ? error.statusText || 'The requested page could not be loaded.'
    : error instanceof Error
      ? error.message
      : 'The requested page could not be loaded.';

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-surface-base p-6">
      <section className="w-full max-w-xl rounded-lg border border-risk-high/40 bg-white p-8 text-center shadow-lg" role="alert" aria-labelledby="route-error-heading">
        <AlertTriangle className="mx-auto h-10 w-10 text-risk-high" aria-hidden="true" />
        <h1 id="route-error-heading" ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold focus:outline-none">
          {status ? `Page error ${status}` : 'This page encountered an error'}
        </h1>
        <p className="mt-3 text-text-secondary">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => window.location.reload()}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Retry page
          </Button>
          <Link to="/app" className="inline-flex items-center rounded border border-forge-silver-500 px-4 py-2 font-medium focus-visible:ring-2 focus-visible:ring-accent">
            Return to your home
          </Link>
        </div>
      </section>
    </main>
  );
}
