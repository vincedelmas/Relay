import {routeTree} from "@/routeTree.gen";
import {createRouter} from "@tanstack/react-router";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {setupCoreRouterSsrQueryIntegration} from "@tanstack/router-ssr-query-core";


export function getRouter() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                staleTime: 2 * 1000,
                refetchOnWindowFocus: false,
            },
        },
    });

    const router = createRouter({
        routeTree,
        context: { queryClient },
        defaultPreload: false,
        defaultPreloadStaleTime: 0,
        scrollRestoration: true,
        defaultStructuralSharing: true,
        notFoundMode: "root",
        Wrap: ({ children }) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        ),
    });

    if (import.meta.env.DEV) {
        setupCoreRouterSsrQueryIntegration({ router, queryClient });
    }

    return router;
}
