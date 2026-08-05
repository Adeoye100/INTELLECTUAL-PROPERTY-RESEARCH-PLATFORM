import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouter } from './app/AppRouter';
import { NetworkStatusBanner } from './app/NetworkStatusBanner';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <NetworkStatusBanner />
      <AppRouter />
    </QueryClientProvider>
  );
};

export default App;
