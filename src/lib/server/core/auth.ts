import {mcp} from "@better-auth/mcp";
import {clientEnv} from "@/env/client";
import {serverEnv} from "@/env/server";
import {jwt} from "better-auth/plugins";
import {db} from "@/lib/server/database/db";
import {betterAuth} from "better-auth/minimal";
import {logger} from "@/lib/server/core/logger";
import * as schema from "@/lib/server/database/schema";
import {createServerOnlyFn} from "@tanstack/react-start";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {tanstackStartCookies} from "better-auth/tanstack-start";
import {MCP_RESOURCE, MCP_SCOPES} from "@/lib/server/core/mcp/config";


const getAuthConfig = createServerOnlyFn(() => betterAuth({
    appName: "Relay",
    baseURL: clientEnv.VITE_BASE_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { schema, provider: "sqlite" }),
    telemetry: {
        enabled: false,
    },
    logger: {
        level: "info",
        log: (level, message, ...args) => {
            logger[level]({
                source: "better-auth",
                err: args.find((arg) => arg instanceof Error),
                details: args.filter((arg) => !(arg instanceof Error)),
            }, message);
        },
    },
    session: {
        cookieCache: {
            enabled: false,
        },
    },
    account: {
        encryptOAuthTokens: true,
    },
    emailAndPassword: {
        enabled: true,
        autoSignIn: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        disableSignUp: true,
    },
    advanced: {
        cookiePrefix: "relay",
    },
    plugins: [
        jwt({ disableSettingJwtHeader: true }),
        mcp({
            scopes: MCP_SCOPES,
            resource: MCP_RESOURCE,
            loginPage: "/login",
            consentPage: "/oauth/consent",
            accessTokenExpiresIn: 15 * 60,
            allowPublicClientPrelogin: true,
            allowDynamicClientRegistration: true,
            allowUnauthenticatedClientRegistration: true,
            grantTypes: ["authorization_code", "refresh_token"],
            clientPrivileges: () => false,
        }),
        tanstackStartCookies(),
    ],
}));


export const auth = getAuthConfig();
