import { Suspense, type ComponentType } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { MainLayout } from './MainLayout';
import { RouteErrorScreen, RouteLoading } from './RouteFeedback';
import { RequireAdmin, RequireAuthentication, RequireRole, RoleHomeRedirect } from '../features/auth/RouteGuards';

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
      { path: 'search', lazy: lazyComponent(() => import('../features/search/SearchScreen'), 'SearchScreen') },
      { path: 'search/risk/:id', lazy: lazyComponent(() => import('../features/search/RiskDetailScreen'), 'RiskDetailScreen') },
      {
        path: 'office-actions',
        lazy: async () => {
          const { OfficeActionResearchScreen } = await import('../features/office-action/OfficeActionResearchScreen');
          return { Component: () => <RequireRole allowedRoles={['admin', 'attorney']}><OfficeActionResearchScreen /></RequireRole> };
        },
      },
      { path: 'portfolio', lazy: lazyComponent(() => import('../features/portfolio/PortfolioScreen'), 'PortfolioScreen') },
      { path: 'portfolio/:markId', lazy: lazyComponent(() => import('../features/portfolio/PortfolioDetailScreen'), 'PortfolioDetailScreen') },
      { path: 'watches', lazy: lazyComponent(() => import('../features/watches/WatchesScreen'), 'WatchesScreen') },
      { path: 'permission-denied', lazy: lazyComponent(() => import('../features/auth/PermissionDeniedScreen'), 'PermissionDeniedScreen') },
      {
        path: 'admin',
        lazy: async () => {
          const { AdminScreen } = await import('../features/billing/AdminScreen');
          return { Component: () => <RequireAdmin><AdminScreen /></RequireAdmin> };
        },
      },
    ],
  },
]);

export function AppRouter() {
  return <Suspense fallback={<RouteLoading />}><RouterProvider router={router} /></Suspense>;
}
