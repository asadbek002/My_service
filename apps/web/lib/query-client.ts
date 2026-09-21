import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 soniya
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message === 'SESSION_EXPIRED') return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
