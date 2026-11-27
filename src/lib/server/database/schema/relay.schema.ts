import {customJson} from "@/lib/server/database/custom-types";
import {oauthClient} from "@/lib/server/database/schema/oauth.schema";
import type {OAuthDiscoveryState} from "@modelcontextprotocol/sdk/client/auth.js";
import {index, integer, snakeCase, text, uniqueIndex} from "drizzle-orm/sqlite-core";


export type ClientGatewayMode = "code" | "classic";
export type ProviderKind = "remote_mcp" | "builtin";
export type ProviderAuthType = "none" | "oauth" | "bearer";


export const provider = snakeCase.table("provider", {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: text("kind").$type<ProviderKind>().notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    readOnly: integer("read_only", { mode: "boolean" }).default(false).notNull(),
    url: text("url"),
    authType: text("auth_type").$type<ProviderAuthType>().default("oauth").notNull(),
    encryptedAuthSecret: text("encrypted_auth_secret"),
    builtinKey: text("builtin_key"),
    encryptedConfig: text("encrypted_config"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});


export const providerOauthState = snakeCase.table("provider_oauth_state", {
    providerId: text("provider_id").primaryKey().references(() => provider.id, { onDelete: "cascade" }),
    encryptedClientInfo: text("encrypted_client_info"),
    encryptedTokens: text("encrypted_tokens"),
    discoveryState: customJson<OAuthDiscoveryState>("discovery_state"),
    encryptedCodeVerifier: text("encrypted_code_verifier"),
    oauthState: text("oauth_state"),
    oauthStateExpiresAt: integer("oauth_state_expires_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
    index("providerOauthState_oauthState_idx").on(table.oauthState),
]);


export const providerTool = snakeCase.table("provider_tool", {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull().references(() => provider.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    jsName: text("js_name").notNull(),
    title: text("title"),
    description: text("description").default("").notNull(),
    inputSchema: customJson<Record<string, unknown>>("input_schema").notNull(),
    outputSchema: customJson<Record<string, unknown>>("output_schema"),
    readOnly: integer("read_only", { mode: "boolean" }).default(false).notNull(),
    destructive: integer("destructive", { mode: "boolean" }).default(false).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
    index("providerTool_providerId_idx").on(table.providerId),
    uniqueIndex("providerTool_providerId_name_uidx").on(table.providerId, table.name),
    uniqueIndex("providerTool_providerId_jsName_uidx").on(table.providerId, table.jsName),
]);


export const clientPolicy = snakeCase.table("client_policy", {
    clientId: text("client_id").primaryKey().references(() => oauthClient.clientId, { onDelete: "cascade" }),
    mode: text("mode").$type<ClientGatewayMode>().default("code").notNull(),
    readOnly: integer("read_only", { mode: "boolean" }).default(false).notNull(),
    allowedProviderIds: customJson<string[]>("allowed_provider_ids").default([]).notNull(),
    revokedAt: integer("revoked_at"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});


export const executionLog = snakeCase.table("execution_log", {
    id: text("id").primaryKey(),
    clientId: text("client_id"),
    clientName: text("client_name"),
    kind: text("kind").$type<"call" | "execute">().notNull(),
    providerSlug: text("provider_slug"),
    toolName: text("tool_name"),
    code: text("code"),
    toolCallCount: integer("tool_call_count").default(0).notNull(),
    status: text("status").$type<"ok" | "error">().notNull(),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
    index("executionLog_createdAt_idx").on(table.createdAt),
]);
