import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { MainLayout } from './MainLayout';
import { LoginScreen } from '../features/auth/LoginScreen';
import { SignupScreen } from '../features/auth/SignupScreen';
import { SearchScreen } from '../features/search/SearchScreen';
import { RiskDetailScreen } from '../features/search/RiskDetailScreen';
import { OfficeActionResearchScreen } from '../features/office-action/OfficeActionResearchScreen';
import { PortfolioScreen } from '../features/portfolio/PortfolioScreen';
import { WatchesScreen } from '../features/watches/WatchesScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { AdminScreen } from '../features/billing/AdminScreen';

import { LandingPage } from '../features/landing/pages/LandingPage';
import { RequireAdmin, RequireAuthentication } from '../features/auth/RouteGuards';
import { RequireRole, RoleHomeRedirect } from '../features/auth/RouteGuards';
import { InviteAcceptanceScreen } from '../features/auth/InviteAcceptanceScreen';
import { PasswordResetRequestScreen, PasswordUpdateScreen } from '../features/auth/PasswordResetScreens';
import { EmailVerificationScreen } from '../features/auth/EmailVerificationScreen';
import { PermissionDeniedScreen } from '../features/auth/PermissionDeniedScreen';

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <LoginScreen /> },
      { path: 'signup', element: <SignupScreen /> },
      { path: 'invite/:token', element: <InviteAcceptanceScreen /> },
      { path: 'forgot-password', element: <PasswordResetRequestScreen /> },
      { path: 'reset-password/:token', element: <PasswordUpdateScreen /> },
      { path: 'verify-email', element: <EmailVerificationScreen /> },
      { path: 'verify-email/:token', element: <EmailVerificationScreen /> },
    ],
  },
  {
    path: '/',
    element: (
      <RequireAuthentication>
        <MainLayout />
      </RequireAuthentication>
    ),
    children: [
      { path: 'dashboard', element: <DashboardScreen /> },
      { path: 'app', element: <RoleHomeRedirect /> },
      { path: 'search', element: <SearchScreen /> },
      { path: 'search/risk/:id', element: <RiskDetailScreen /> },
      {
        path: 'office-actions',
        element: (
          <RequireRole allowedRoles={['admin', 'attorney']}>
            <OfficeActionResearchScreen />
          </RequireRole>
        ),
      },
      { path: 'portfolio', element: <PortfolioScreen /> },
      { path: 'watches', element: <WatchesScreen /> },
      { path: 'permission-denied', element: <PermissionDeniedScreen /> },
      {
        path: 'admin',
        element: (
          <RequireAdmin>
            <AdminScreen />
          </RequireAdmin>
        ),
      },
    ],
  },
]);

export const AppRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};
