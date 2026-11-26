import {createStart} from "@tanstack/react-start";
import {csrfMiddleware} from "@/lib/server/middlewares/csrf";


export const startInstance = createStart(() => ({
    defaultSsr: false,
    requestMiddleware: [csrfMiddleware],
}));
