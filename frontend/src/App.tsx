import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './app/AppRouter';
import { NetworkStatusBanner } from './app/NetworkStatusBanner';
import { DemoBanner } from './components/DemoBanner';
import { appQueryClient } from './lib/queryClient';
import './styles/index.css';

const App: React.FC = () => {
  return (
    <QueryClientProvider client={appQueryClient}>
      <DemoBanner />
      <NetworkStatusBanner />
      <AppRouter />
    </QueryClientProvider>
  );
};

export default App;
