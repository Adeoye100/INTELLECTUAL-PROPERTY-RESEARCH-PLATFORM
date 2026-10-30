import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/react';
import { AppRouter } from './app/AppRouter';
import { NetworkStatusBanner } from './app/NetworkStatusBanner';
import { DemoBanner } from './components/DemoBanner';
import { appQueryClient } from './lib/queryClient';
import { ClerkSessionSync } from './features/auth/ClerkSessionSync';
import './styles/index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

const AppContent: React.FC = () => {
  return (
    <QueryClientProvider client={appQueryClient}>
      {clerkPublishableKey ? <ClerkSessionSync /> : null}
      <DemoBanner />
      <NetworkStatusBanner />
      <AppRouter />
    </QueryClientProvider>
  );
};

const App: React.FC = () => {
  if (clerkPublishableKey) {
    return (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <AppContent />
      </ClerkProvider>
    );
  }

  return <AppContent />;
};

export default App;
