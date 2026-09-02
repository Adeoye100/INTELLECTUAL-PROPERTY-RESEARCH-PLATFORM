import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { MainLayout } from './MainLayout';
import { RouteErrorScreen, RouteLoading } from './RouteFeedback';
import { RequireAdmin, RequireAuthentication, RoleHomeRedirect } from '../features/auth/RouteGuards';
import { FeatureUnavailable } from './FeatureUnavailable';
import { AdminUsersScreen } from '../features/admin/AdminUsersScreen';

const BillingScreen = lazy(() => import('../features/billing/AdminScreen').then(({ AdminScreen }) => ({ default: AdminScreen })));

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
      { path: 'create-organization', lazy: lazyComponent(() => import('../features/auth/CreateOrganizationScreen'), 'CreateOrganizationScreen') },
      { path: 'signup', element: <Navigate to="/auth/create-organization" replace /> },
      { path: 'callback', lazy: lazyComponent(() => import('../features/auth/OAuthCallbackScreen'), 'OAuthCallbackScreen') },
      { path: 'invite/:token', lazy: lazyComponent(() => import('../features/auth/InviteRedemptionScreen'), 'InviteRedemptionScreen') },
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
      { path: 'portfolio', lazy: lazyComponent(() => import('../features/portfolio/PortfolioScreen'), 'PortfolioScreen') },
      { path: 'portfolio/:markId', lazy: lazyComponent(() => import('../features/portfolio/PortfolioDetailScreen'), 'PortfolioDetailScreen') },
      { path: 'watches', element: <FeatureUnavailable title="Watch monitoring is not available" detail="It remains disabled until Redis and the separate watch worker are configured and verified." /> },
      { path: 'permission-denied', lazy: lazyComponent(() => import('../features/auth/PermissionDeniedScreen'), 'PermissionDeniedScreen') },
      { path: 'admin', element: <RequireAdmin><Navigate to="/admin/users" replace /></RequireAdmin> },
      { path: 'admin/users', element: <RequireAdmin><AdminUsersScreen /></RequireAdmin> },
      { path: 'admin/billing', element: <RequireAdmin><Suspense fallback={<RouteLoading />}><BillingScreen /></Suspense></RequireAdmin> },
    ],
  },
]);


export function AppRouter() {
  return <Suspense fallback={<RouteLoading />}><RouterProvider router={router} /></Suspense>;
}
