import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnMount: false,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,

                retry: false,
                gcTime: 120_000,
            },
        },
    });
}

export const queryClient = createQueryClient();
