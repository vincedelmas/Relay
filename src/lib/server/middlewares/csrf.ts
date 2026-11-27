import {clientEnv} from "@/env/client";
import {logger} from "@/lib/server/core/logger";
import {createCsrfMiddleware, createServerOnlyFn} from "@tanstack/react-start";


const logCsrfFailure = createServerOnlyFn((request: Request) => {
    const requestUrl = new URL(request.url);

    logger.warn({
        method: request.method,
        pathname: requestUrl.pathname,
        host: request.headers.get("Host"),
        origin: request.headers.get("Origin"),
    }, "CSRF validation failed");
});


export const csrfMiddleware = createCsrfMiddleware({
    origin: new URL(clientEnv.VITE_BASE_URL).origin,
    filter: (ctx) => ctx.handlerType === "serverFn",
    failureResponse: (ctx) => {
        logCsrfFailure(ctx.request);
        return new Response("Forbidden", { status: 403 });
    },
});
