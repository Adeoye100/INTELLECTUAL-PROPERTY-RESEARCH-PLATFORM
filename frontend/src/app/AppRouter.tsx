import { Suspense, type ComponentType } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { MainLayout } from './MainLayout';
import { RouteErrorScreen, RouteLoading } from './RouteFeedback';
import { RequireAuthentication, RoleHomeRedirect } from '../features/auth/RouteGuards';
import { FeatureUnavailable } from './FeatureUnavailable';

type RouteModule = Record<string, ComponentType>;

function lazyComponent(loader: () => Promise<RouteModule>, exportName: string) {
  return async () => {
    const module = await loader();
    return { Component: module[exportName] };
  };
}

const router = createBrowserRouter([
  {
    path: '/',
    errorElement: <RouteErrorScreen />,
    lazy: lazyComponent(() => import('../features/landing/pages/LandingPage'), 'LandingPage'),
  },
  {
    path: '/auth',
    element: <AuthLayout />,
    errorElement: <RouteErrorScreen />,
    children: [
      { path: 'login', lazy: lazyComponent(() => import('../features/auth/LoginScreen'), 'LoginScreen') },
      { path: 'signup', lazy: lazyComponent(() => import('../features/auth/SignupScreen'), 'SignupScreen') },
      { path: 'callback', lazy: lazyComponent(() => import('../features/auth/OAuthCallbackScreen'), 'OAuthCallbackScreen') },
      { path: 'invite/:token', lazy: lazyComponent(() => import('../features/auth/InviteAcceptanceScreen'), 'InviteAcceptanceScreen') },
      { path: 'forgot-password', lazy: lazyComponent(() => import('../features/auth/PasswordResetScreens'), 'PasswordResetRequestScreen') },
      { path: 'reset-password', lazy: lazyComponent(() => import('../features/auth/PasswordResetScreens'), 'PasswordUpdateScreen') },
      { path: 'reset-password/:token', lazy: lazyComponent(() => import('../features/auth/PasswordResetScreens'), 'PasswordUpdateScreen') },
      { path: 'verify-email', lazy: lazyComponent(() => import('../features/auth/EmailVerificationScreen'), 'EmailVerificationScreen') },
      { path: 'verify-email/:token', lazy: lazyComponent(() => import('../features/auth/EmailVerificationScreen'), 'EmailVerificationScreen') },
    ],
  },
  {
    path: '/',
    element: <RequireAuthentication><MainLayout /></RequireAuthentication>,
    errorElement: <RouteErrorScreen />,
    children: [
      { path: 'dashboard', lazy: lazyComponent(() => import('../features/dashboard/DashboardScreen'), 'DashboardScreen') },
      { path: 'app', element: <RoleHomeRedirect /> },
      { path: 'search', element: <FeatureUnavailable title="Federated trademark search is not available" detail="It remains disabled until Elasticsearch is provisioned and the attributed registry documents are fully reprojected." /> },
      { path: 'search/risk/:id', element: <FeatureUnavailable title="Risk analysis is not available" detail="Search-backed risk analysis is disabled with the federated search integration." /> },
      { path: 'office-actions', element: <FeatureUnavailable title="Office Action search is not available" detail="It remains disabled until a licensed provider and its server-side integration are configured and verified." /> },
      { path: 'portfolio', element: <FeatureUnavailable title="Portfolio management is not available" detail="The existing frontend and backend portfolio contracts require reconciliation before this workflow can be safely enabled." /> },
      { path: 'portfolio/:markId', element: <FeatureUnavailable title="Portfolio management is not available" detail="The existing frontend and backend portfolio contracts require reconciliation before this workflow can be safely enabled." /> },
      { path: 'watches', element: <FeatureUnavailable title="Watch monitoring is not available" detail="It remains disabled until Redis and the separate watch worker are configured and verified." /> },
      { path: 'permission-denied', lazy: lazyComponent(() => import('../features/auth/PermissionDeniedScreen'), 'PermissionDeniedScreen') },
      { path: 'admin', element: <FeatureUnavailable title="Billing and administration are not available" detail="The current administration screen contains demonstration billing data. Billing is not implemented for the initial deployment." /> },
    ],
  },
]);

export function AppRouter() {
  return <Suspense fallback={<RouteLoading />}><RouterProvider router={router} /></Suspense>;
}
