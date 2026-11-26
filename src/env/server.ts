import * as z from "zod";
import {createEnv} from "@t3-oss/env-core";


export const serverEnv = createEnv({
    server: {
        // Database
        DATABASE_URL: z.string().default("./instance/site.db"),

        // Better Auth
        BETTER_AUTH_SECRET: z.string().min(20),

        // Upstream OAuth token encryption
        RELAY_ENCRYPTION_KEY: z.string().min(20),

        // Optional built-in Steam provider
        STEAM_API_KEY: z.string().trim().min(1).optional(),
        STEAM_ID: z.string().trim().min(1).optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
