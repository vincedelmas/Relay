import {auth} from "@/lib/server/core/auth";
import {redirect} from "@tanstack/react-router";
import {createMiddleware} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";


export const requiredAuthMiddleware = createMiddleware({ type: "function" })
    .server(async ({ next }) => {
        const { headers } = getRequest();
        const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });

        if (!session?.user) {
            throw redirect({ to: "/login" });
        }

        return next({
            context: {
                currentUser: session.user,
            },
        });
    });
