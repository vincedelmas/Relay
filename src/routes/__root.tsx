/// <reference types="vite/client"/>
import React from "react";
import appCSS from "@/styles.css?url";
import type {QueryClient} from "@tanstack/react-query";
import {ReactQueryDevtools} from "@tanstack/react-query-devtools";
import {TooltipProvider} from "@/lib/client/components/ui/tooltip";
import {ClientOnly, createRootRouteWithContext, HeadContent, Outlet, Scripts} from "@tanstack/react-router";


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    ssr: false,
    head: () => ({
        links: [
            { rel: "preconnect", href: "https://fonts.googleapis.com" },
            { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
            {
                rel: "stylesheet",
                href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
            },
            { rel: "stylesheet", href: appCSS },
            { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        ],
        meta: [
            { charSet: "utf-8" },
            { title: "Relay — Personal MCP Gateway" },
            { name: "color-scheme", content: "dark" },
            { name: "theme-color", content: "#0a0b0e" },
            { name: "viewport", content: "width=device-width, initial-scale=1" },
        ],
    }),
    component: RootComponent,
    shellComponent: RootShell,
});


function RootShell({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark" data-theme="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
            <head>
                <HeadContent/>
            </head>
            <body className="min-h-screen bg-background">
                {children}
                <Scripts/>
            </body>
        </html>
    );
}


function RootComponent() {
    return (
        <ClientOnly>
            <TooltipProvider delay={180}>
                <Outlet/>
            </TooltipProvider>
            {import.meta.env.DEV && <ReactQueryDevtools buttonPosition="bottom-left"/>}
        </ClientOnly>
    );
}
