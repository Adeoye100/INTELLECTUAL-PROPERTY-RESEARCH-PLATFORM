import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { MainLayout } from './MainLayout';
import { RouteErrorScreen, RouteLoading } from './RouteFeedback';
import { RequireAdmin, RequireAuthentication, RequireRole, RoleHomeRedirect } from '../features/auth/RouteGuards';
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

import { features } from '../config/features';

const SearchScreen = lazy(() => import('../features/search/SearchScreen').then(({ SearchScreen }) => ({ default: SearchScreen })));
const RiskAnalysisScreen = lazy(() => import('../features/search/RiskAnalysisScreen').then(({ RiskAnalysisScreen }) => ({ default: RiskAnalysisScreen })));
const RiskDetailScreen = lazy(() => import('../features/search/RiskDetailScreen').then(({ RiskDetailScreen }) => ({ default: RiskDetailScreen })));
const OfficeActionResearchScreen = lazy(() => import('../features/office-action/OfficeActionResearchScreen').then(({ OfficeActionResearchScreen }) => ({ default: OfficeActionResearchScreen })));
const WatchesScreen = lazy(() => import('../features/watches/WatchesScreen').then(({ WatchesScreen }) => ({ default: WatchesScreen })));
const ReportsScreen = lazy(() => import('../features/reports/ReportsScreen').then(({ ReportsScreen }) => ({ default: ReportsScreen })));

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
      {
        path: 'search',
        element: features.searchEnabled ? (
          <Suspense fallback={<RouteLoading />}><SearchScreen /></Suspense>
        ) : (
          <FeatureUnavailable title="Trademark search is temporarily unavailable" detail="The Search workspace is part of the product, but live registry search remains fail-closed until its production data and freshness gates are activated." />
        ),
      },
      {
        path: 'risk-analysis',
        element: features.searchEnabled ? (
          <Suspense fallback={<RouteLoading />}><RiskAnalysisScreen /></Suspense>
        ) : (
          <FeatureUnavailable title="Risk analysis is temporarily unavailable" detail="Risk analysis starts from an authoritative trademark Search result, so it remains unavailable until Search production activation is complete." />
        ),
      },
      {
        path: 'search/risk/:searchId/:resultId',
        element: features.searchEnabled ? (
          <Suspense fallback={<RouteLoading />}><RiskDetailScreen /></Suspense>
        ) : (
          <FeatureUnavailable title="Risk analysis is temporarily unavailable" detail="Trademark search is temporarily unavailable while registry search services are being activated or refreshed." />
        ),
      },
      {
        path: 'search/risk/:id',
        element: features.searchEnabled ? (
          <Suspense fallback={<RouteLoading />}><RiskDetailScreen /></Suspense>
        ) : (
          <FeatureUnavailable title="Risk analysis is temporarily unavailable" detail="Trademark search is temporarily unavailable while registry search services are being activated or refreshed." />
        ),
      },
      {
        path: 'search-results/:searchId',
        element: features.searchEnabled ? (
          <Suspense fallback={<RouteLoading />}><RiskDetailScreen /></Suspense>
        ) : (
          <FeatureUnavailable title="Risk analysis is temporarily unavailable" detail="Trademark search is temporarily unavailable while registry search services are being activated or refreshed." />
        ),
      },
      {
        path: 'office-actions',
        element: features.officeActionSearchEnabled ? (
          <Suspense fallback={<RouteLoading />}><OfficeActionResearchScreen /></Suspense>
        ) : (
          <FeatureUnavailable title="Office Action research is temporarily unavailable" detail="Office Action research remains fail-closed until an authorized trademark corpus and source-discovery prerequisite are available." />
        ),
      },
      { path: 'portfolio', lazy: lazyComponent(() => import('../features/portfolio/PortfolioScreen'), 'PortfolioScreen') },
      { path: 'portfolio/:markId', lazy: lazyComponent(() => import('../features/portfolio/PortfolioDetailScreen'), 'PortfolioDetailScreen') },
      {
        path: 'watches',
        element: features.watchEnabled ? (
          <Suspense fallback={<RouteLoading />}><WatchesScreen /></Suspense>
        ) : (
          <FeatureUnavailable title="Watch monitoring is temporarily unavailable" detail="The Watches workspace is part of the product, but monitoring remains fail-closed until Search freshness and the production watch worker are activated." />
        ),
      },
      {
        path: 'reports',
        element: (
          <RequireRole allowedRoles={['admin', 'attorney']}>
            <Suspense fallback={<RouteLoading />}><ReportsScreen /></Suspense>
          </RequireRole>
        ),
      },
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
