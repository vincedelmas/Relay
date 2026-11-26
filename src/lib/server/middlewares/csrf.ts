import {clientEnv} from "@/env/client";
import {logger} from "@/lib/server/core/logger";
import {createCsrfMiddleware, createServerOnlyFn} from "@tanstack/react-start";


const logCsrfFailure = createServerOnlyFn((request: Request) => {
    const requestUrl = new URL(request.url);
    logger.warn({
        method: request.method,
        pathname: requestUrl.pathname,
        origin: request.headers.get("Origin"),
        host: request.headers.get("Host"),
    }, "CSRF validation failed");
});


export const csrfMiddleware = createCsrfMiddleware({
    filter: (ctx) => ctx.handlerType === "serverFn",
    origin: new URL(clientEnv.VITE_BASE_URL).origin,
    failureResponse: (ctx) => {
        logCsrfFailure(ctx.request);
        return new Response("Forbidden", { status: 403 });
    },
});
