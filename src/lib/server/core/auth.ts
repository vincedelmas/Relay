import {eq} from "drizzle-orm";
import {mcp} from "@better-auth/mcp";
import {cimd} from "@better-auth/cimd";
import {clientEnv} from "@/env/client";
import {serverEnv} from "@/env/server";
import {APIError} from "better-auth/api";
import {jwt} from "better-auth/plugins";
import {db} from "@/lib/server/database/db";
import {betterAuth} from "better-auth/minimal";
import {logger} from "@/lib/server/core/logger";
import * as schema from "@/lib/server/database/schema";
import {createServerOnlyFn} from "@tanstack/react-start";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {tanstackStartCookies} from "better-auth/tanstack-start";
import {MCP_RESOURCE, MCP_SCOPES} from "@/lib/server/core/mcp/config";
import {fetchClientMetadataResource} from "@/lib/server/core/cimd-fetch";


const googleOAuthConfig = serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET
    ? {
        clientId: serverEnv.GOOGLE_CLIENT_ID,
        clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
    }
    : null;


const assertOwnerEmail = (email: string | undefined, emailVerified: boolean) => {
    if (!serverEnv.OWNER_EMAIL || !emailVerified || email?.toLowerCase() !== serverEnv.OWNER_EMAIL) {
        throw new APIError("FORBIDDEN", {
            code: "OWNER_ONLY",
            message: "This Relay instance is restricted to its configured owner.",
        });
    }
};


const getAuthConfig = createServerOnlyFn(() => betterAuth({
    appName: "Relay",
    baseURL: clientEnv.VITE_BASE_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { schema, provider: "sqlite" }),
    telemetry: {
        enabled: false,
    },
    onAPIError: {
        errorURL: new URL("/login", clientEnv.VITE_BASE_URL).toString(),
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
    databaseHooks: {
        account: {
            create: {
                before: async (account) => ({ data: { ...account, idToken: null } }),
            },
            update: {
                before: async (account) => ({ data: { ...account, idToken: null } }),
            },
        },
        user: {
            create: {
                before: async (newUser) => {
                    assertOwnerEmail(newUser.email, Boolean(newUser.emailVerified));
                },
            },
        },
        session: {
            create: {
                before: async (newSession) => {
                    const existingUser = db
                        .select({ email: schema.user.email, emailVerified: schema.user.emailVerified })
                        .from(schema.user)
                        .where(eq(schema.user.id, newSession.userId))
                        .get();
                    assertOwnerEmail(existingUser?.email, Boolean(existingUser?.emailVerified));
                },
            },
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
    socialProviders: {
        ...(googleOAuthConfig ? { google: googleOAuthConfig } : {}),
    },
    advanced: {
        cookiePrefix: "relay",
    },
    plugins: [
        jwt({ disableSettingJwtHeader: true }),
        mcp({
            scopes: MCP_SCOPES,
            loginPage: "/login",
            resource: MCP_RESOURCE,
            consentPage: "/oauth/consent",
            accessTokenExpiresIn: 15 * 60,
            allowPublicClientPrelogin: true,
            allowDynamicClientRegistration: true,
            allowUnauthenticatedClientRegistration: true,
            grantTypes: ["authorization_code", "refresh_token"],
            clientPrivileges: () => false,
            customAccessTokenClaims: () => ({ relayIssuedAt: Date.now() }),
        }),
        cimd({
            fetchClientMetadataResource,
            metadataProfile: "mcp-2026-07-28",
        }),
        tanstackStartCookies(),
    ],
}));


export const auth = getAuthConfig();
