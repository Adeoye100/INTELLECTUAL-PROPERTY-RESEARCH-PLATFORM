import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { MainLayout } from './MainLayout';
import { LoginScreen } from '../features/auth/LoginScreen';
import { SignupScreen } from '../features/auth/SignupScreen';
import { SearchScreen } from '../features/search/SearchScreen';
import { RiskDetailScreen } from '../features/search/RiskDetailScreen';
import { PortfolioScreen } from '../features/portfolio/PortfolioScreen';
import { WatchesScreen } from '../features/watches/WatchesScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { AdminScreen } from '../features/billing/AdminScreen';

import { LandingPage } from '../features/landing/pages/LandingPage';

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
    ],
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { path: 'dashboard', element: <DashboardScreen /> },
      { path: 'search', element: <SearchScreen /> },
      { path: 'search/risk/:id', element: <RiskDetailScreen /> },
      { path: 'portfolio', element: <PortfolioScreen /> },
      { path: 'watches', element: <WatchesScreen /> },
      { path: 'admin', element: <AdminScreen /> },
    ],
  },
]);

export const AppRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};
