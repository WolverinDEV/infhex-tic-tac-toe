import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnMount: false,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,

                retry: false,
            },
        }
    })
}

export const queryClient = createQueryClient()
