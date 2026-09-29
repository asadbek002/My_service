import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Always refetch when a page opens or the app comes back to the foreground, so a list
      // never shows what was there before a change made on another screen.
      staleTime: 0,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // A 4xx answer will not change on retry (expired session, no access, not found).
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
