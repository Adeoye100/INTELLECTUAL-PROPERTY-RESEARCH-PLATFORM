import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { MainLayout } from './MainLayout';
import { RouteErrorScreen, RouteLoading } from './RouteFeedback';
import { RequireAdmin, RequireAuthentication, RequireRole, RoleHomeRedirect } from '../features/auth/RouteGuards';
import { FeatureUnavailable } from './FeatureUnavailable';
import { AdminUsersScreen } from '../features/admin/AdminUsersScreen';
import { RuntimeFeatureBoundary } from '../features/system/RuntimeFeatureBoundary';
import { features } from '../config/features';

type RouteModule = Record<string, ComponentType>;

function lazyComponent(loader: () => Promise<RouteModule>, exportName: string) {
  return async () => {
    const module = await loader();
    return { Component: module[exportName] };
  };
}

const SearchScreen = lazy(() => import('../features/search/SearchScreen').then(({ SearchScreen }) => ({ default: SearchScreen })));
const PreliminarySearchScreen = lazy(() => import('../features/search/PreliminarySearchScreen').then(({ PreliminarySearchScreen }) => ({ default: PreliminarySearchScreen })));
const RiskAnalysisScreen = lazy(() => import('../features/search/RiskAnalysisScreen').then(({ RiskAnalysisScreen }) => ({ default: RiskAnalysisScreen })));
const PreliminaryRiskAnalysisScreen = lazy(() => import('../features/search/PreliminaryRiskAnalysisScreen').then(({ PreliminaryRiskAnalysisScreen }) => ({ default: PreliminaryRiskAnalysisScreen })));
const RiskDetailScreen = lazy(() => import('../features/search/RiskDetailScreen').then(({ RiskDetailScreen }) => ({ default: RiskDetailScreen })));
const OfficeActionResearchScreen = lazy(() => import('../features/office-action/OfficeActionResearchScreen').then(({ OfficeActionResearchScreen }) => ({ default: OfficeActionResearchScreen })));
const PreliminaryOfficeActionScreen = lazy(() => import('../features/office-action/PreliminaryOfficeActionScreen').then(({ PreliminaryOfficeActionScreen }) => ({ default: PreliminaryOfficeActionScreen })));
const WatchesScreen = lazy(() => import('../features/watches/WatchesScreen').then(({ WatchesScreen }) => ({ default: WatchesScreen })));
const PreliminaryWatchesScreen = lazy(() => import('../features/watches/PreliminaryWatchesScreen').then(({ PreliminaryWatchesScreen }) => ({ default: PreliminaryWatchesScreen })));
const ReportsScreen = lazy(() => import('../features/reports/ReportsScreen').then(({ ReportsScreen }) => ({ default: ReportsScreen })));
const PreliminaryReportsScreen = lazy(() => import('../features/reports/PreliminaryReportsScreen').then(({ PreliminaryReportsScreen }) => ({ default: PreliminaryReportsScreen })));

function runtimeSearch(child: ReactElement) {
  return (
    <RuntimeFeatureBoundary
      feature="search"
      allowDegraded
      blockedTitle="Registry search is unavailable"
      blockedDetail="The persisted trademark corpus is not ready for research yet."
      disabledTitle="Registry search is disabled"
      disabledDetail="Search has not been enabled for this deployment."
    >
      {child}
    </RuntimeFeatureBoundary>
  );
}

function runtimeRisk(child: ReactElement) {
  return (
    <RuntimeFeatureBoundary
      feature="riskAnalysis"
      allowDegraded
      blockedTitle="Risk analysis is unavailable"
      blockedDetail="Risk evidence requires an available persisted trademark search corpus."
    >
      {child}
    </RuntimeFeatureBoundary>
  );
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
      {
        path: 'search',
        element: (
          <Suspense fallback={<RouteLoading />}>
            {features.searchEnabled ? runtimeSearch(<SearchScreen />) : <PreliminarySearchScreen />}
          </Suspense>
        ),
      },
      {
        path: 'risk-analysis',
        element: (
          <Suspense fallback={<RouteLoading />}>
            {features.searchEnabled ? runtimeRisk(<RiskAnalysisScreen />) : <PreliminaryRiskAnalysisScreen />}
          </Suspense>
        ),
      },
      {
        path: 'search/risk/:searchId/:resultId',
        element: features.searchEnabled ? (
          <Suspense fallback={<RouteLoading />}>{runtimeRisk(<RiskDetailScreen />)}</Suspense>
        ) : (
          <FeatureUnavailable title="Live search risk detail is unavailable" detail="Use Risk Analysis for preliminary comparisons of saved portfolio marks until live Search is activated." />
        ),
      },
      {
        path: 'search/risk/:id',
        element: features.searchEnabled ? (
          <Suspense fallback={<RouteLoading />}>{runtimeRisk(<RiskDetailScreen />)}</Suspense>
        ) : (
          <FeatureUnavailable title="Live search risk detail is unavailable" detail="Use Risk Analysis for preliminary comparisons of saved portfolio marks until live Search is activated." />
        ),
      },
      {
        path: 'search-results/:searchId',
        element: features.searchEnabled ? (
          <Suspense fallback={<RouteLoading />}>{runtimeRisk(<RiskDetailScreen />)}</Suspense>
        ) : (
          <FeatureUnavailable title="Live search history is unavailable" detail="Workspace Search remains usable against saved portfolio records until live registry Search is activated." />
        ),
      },
      {
        path: 'office-actions',
        element: (
          <Suspense fallback={<RouteLoading />}>
            {features.officeActionSearchEnabled ? (
              <RuntimeFeatureBoundary
                feature="officeActions"
                blockedTitle="Office Action research is not activated"
                blockedDetail="A genuine Office Action corpus must be loaded and verified before this research surface is enabled."
                disabledTitle="Office Action research is disabled"
                disabledDetail="Office Action search has not been enabled for this deployment."
                inactiveFallback={<PreliminaryOfficeActionScreen />}
              >
                <OfficeActionResearchScreen />
              </RuntimeFeatureBoundary>
            ) : <PreliminaryOfficeActionScreen />}
          </Suspense>
        ),
      },
      { path: 'portfolio', lazy: lazyComponent(() => import('../features/portfolio/PortfolioScreen'), 'PortfolioScreen') },
      { path: 'portfolio/:markId', lazy: lazyComponent(() => import('../features/portfolio/PortfolioDetailScreen'), 'PortfolioDetailScreen') },
      {
        path: 'watches',
        element: (
          <Suspense fallback={<RouteLoading />}>
            {features.watchEnabled ? (
              <RuntimeFeatureBoundary
                feature="watches"
                blockedTitle="Watches are unavailable"
                blockedDetail="Watch records are not available in the current runtime."
                disabledTitle="Watches are disabled"
                disabledDetail="Watch automation has not been enabled for this deployment."
              >
                <WatchesScreen />
              </RuntimeFeatureBoundary>
            ) : <PreliminaryWatchesScreen />}
          </Suspense>
        ),
      },
      {
        path: 'reports',
        element: (
          <RequireRole allowedRoles={['admin', 'attorney']}>
            <Suspense fallback={<RouteLoading />}>
              {features.pdfExportEnabled ? (
                <RuntimeFeatureBoundary
                  feature="reports"
                  blockedTitle="Reports are unavailable"
                  blockedDetail="Report generation is not writable in the current runtime."
                  disabledTitle="Reports are disabled"
                  disabledDetail="Server-side PDF export has not been enabled for this deployment."
                >
                  <ReportsScreen />
                </RuntimeFeatureBoundary>
              ) : <PreliminaryReportsScreen />}
            </Suspense>
          </RequireRole>
        ),
      },
      { path: 'permission-denied', lazy: lazyComponent(() => import('../features/auth/PermissionDeniedScreen'), 'PermissionDeniedScreen') },
      { path: 'admin', element: <RequireAdmin><Navigate to="/admin/users" replace /></RequireAdmin> },
      { path: 'admin/users', element: <RequireAdmin><AdminUsersScreen /></RequireAdmin> },
    ],
  },
]);

export function AppRouter() {
  return <Suspense fallback={<RouteLoading />}><RouterProvider router={router} /></Suspense>;
}
