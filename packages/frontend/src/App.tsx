import { DehydratedState, HydrationBoundary, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';

import AppErrorBoundary from './components/AppErrorBoundary';
import { clearHydrationRenderPassFlag, useRenderMode } from './ssrState';

type AppProps = {
    router: Parameters<typeof RouterProvider>[0][`router`]
    queryClient: QueryClient
    dehydratedState?: DehydratedState
};

function App({ router, queryClient, dehydratedState }: Readonly<AppProps>) {
    const renderMode = useRenderMode();

    useEffect(() => clearHydrationRenderPassFlag(), []);

    if (renderMode !== `ssr`) {
        console.log(`Render app root as ${renderMode}`);
    }

    return (
        <AppErrorBoundary>
            <meta charSet="UTF-8" />
            <link rel="icon" type="image/svg+xml" href="/favicon.png" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta name="theme-color" content="#111827" />
            <meta property="og:site_name" content="Infinity Hexagonal Tic-Tac-Toe" />

            <QueryClientProvider client={queryClient}>
                {renderMode === `normal` && <ReactQueryDevtools />}

                <HydrationBoundary state={dehydratedState}>
                    <RouterProvider router={router} />
                </HydrationBoundary>
            </QueryClientProvider>
        </AppErrorBoundary>
    );
}

export default App;
