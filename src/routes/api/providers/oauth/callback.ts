import {auth} from "@/lib/server/core/auth";
import {logger} from "@/lib/server/core/logger";
import {createFileRoute} from "@tanstack/react-router";
import {syncProviderTools} from "@/lib/server/domain/providers/provider.service";
import {finishUpstreamOAuthCallback} from "@/lib/server/domain/providers/upstream-oauth";


const redirectToDashboard = (requestUrl: string, params: Record<string, string>) => {
    const target = new URL("/", requestUrl);
    for (const [k, v] of Object.entries(params)) {
        target.searchParams.set(k, v);
    }
    return Response.redirect(target.toString(), 302);
};


export const Route = createFileRoute("/api/providers/oauth/callback")({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const session = await auth.api.getSession({
                    headers: request.headers,
                    query: { disableCookieCache: true },
                });

                if (!session?.user) {
                    return Response.redirect(new URL("/login", request.url).toString(), 302);
                }

                const url = new URL(request.url);
                const error = url.searchParams.get("error");
                const errorDescription = url.searchParams.get("error_description");
                if (error) {
                    return redirectToDashboard(request.url, {
                        oauthError: errorDescription || error,
                    });
                }

                const state = url.searchParams.get("state");
                const code = url.searchParams.get("code");
                if (!state || !code) {
                    return redirectToDashboard(request.url, {
                        oauthError: "Missing OAuth state or authorization code.",
                    });
                }

                try {
                    const { providerId, slug } = await finishUpstreamOAuthCallback(state, code);
                    try {
                        await syncProviderTools(providerId);
                    }
                    catch (syncErr) {
                        logger.warn({ err: syncErr, providerId }, "OAuth connected but initial tool sync failed");
                    }
                    return redirectToDashboard(request.url, { connected: slug });
                }
                catch (err) {
                    logger.warn({ err }, "Upstream OAuth callback failed");
                    return redirectToDashboard(request.url, {
                        oauthError: err instanceof Error ? err.message : "OAuth connection failed.",
                    });
                }
            },
        },
    },
});
