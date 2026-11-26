/**
 * Production entry point for Relay.
 * Loads the TanStack Start handler and registers static file routes.
 */

import path from "path";
import {logger} from "@/lib/server/core/logger";
import {getStaticCacheControl} from "@/lib/server/core/static-cache-control";
import {installProcessErrorHandlers} from "@/lib/server/core/process-errors";


installProcessErrorHandlers();


const DIST_DIR = import.meta.dir;
const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = path.resolve(DIST_DIR, "client");
const SERVER_ENTRY = path.resolve(DIST_DIR, "server/server.js");


let isShuttingDown = false;
let server: ReturnType<typeof Bun.serve> | undefined;
let closeResources: (() => Promise<void>) | undefined;


const startServer = async () => {
    logger.info({ port: PORT }, "Starting Relay server");

    const { default: handler } = await import(SERVER_ENTRY);

    closeResources = handler.closeResources;
    logger.info("TanStack Start handler loaded");

    const glob = new Bun.Glob("**/*");
    const routes: Record<string, () => Response> = {};

    for await (const relativePath of glob.scan({ cwd: CLIENT_DIR })) {
        const filepath = path.join(CLIENT_DIR, relativePath);
        const route = `/${relativePath.split(path.sep).join(path.posix.sep)}`;

        routes[route] = () => {
            const file = Bun.file(filepath);
            return new Response(file, {
                headers: {
                    "Cache-Control": getStaticCacheControl(route),
                    "Content-Type": file.type || "application/octet-stream",
                },
            });
        };
    }

    logger.info({ count: Object.keys(routes).length }, "Registered static routes");

    server = Bun.serve({
        port: PORT,
        routes: {
            ...routes,
            "/*": (req: Request) => {
                if (isShuttingDown) {
                    return new Response("Service Unavailable", { status: 503, headers: { "Retry-After": "5" } });
                }
                return handler.fetch(req);
            },
        },
        error(err) {
            logger.error({ err }, "Bun server error");
            return new Response("Internal Server Error", { status: 500 });
        },
    });

    logger.info({ port: server.port, url: `http://localhost:${server.port}` }, "Relay server running");
};


const shutdown = async (signal: string) => {
    if (isShuttingDown) return;

    logger.info({ signal }, "Starting graceful shutdown");
    isShuttingDown = true;

    const shutdownTimeout = setTimeout(() => {
        logger.error("Graceful shutdown timed out after 30 seconds, forcing exit");
        process.exit(1);
    }, 30_000);

    try {
        await server?.stop();
        await closeResources?.();
    }
    catch (err) {
        logger.error({ err }, "Failed to shutdown gracefully");
        process.exit(1);
    }

    clearTimeout(shutdownTimeout);
    logger.info("Relay server stopped gracefully");
    process.exit(0);
};


process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));


startServer().catch((err) => {
    logger.fatal({ err }, "Failed to start Relay server");
    process.exit(1);
});
