import { QueryClient } from '@tanstack/react-query';

/** Shared so logout and session expiry can purge firm-scoped cached data before
 * navigation, including when they occur outside a query-rendering component. */
export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
