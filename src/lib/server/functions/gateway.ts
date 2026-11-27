import * as z from "zod";
import {auth} from "@/lib/server/core/auth";
import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {listBuiltInProviders} from "@/lib/server/domain/providers/builtins";
import {requiredAuthMiddleware} from "@/lib/server/middlewares/authentication";
import {startUpstreamOAuthFlow} from "@/lib/server/domain/providers/upstream-oauth";
import {clearExecutionLogs, listExecutionLogs} from "@/lib/server/domain/logs/execution-log.service";
import {listConnectedClients, revokeClientConnection, saveClientPolicy} from "@/lib/server/domain/clients/client-policy.service";
import {
    createProvider,
    deleteProvider,
    describePermittedTools,
    disconnectProviderOAuth,
    executeCodeModeScript,
    invokePermittedTool,
    listProvidersWithSummary,
    searchPermittedTools,
    syncProviderTools,
    toggleProviderTool,
    updateProvider,
} from "@/lib/server/domain/providers/provider.service";


export const getGatewayState = createServerFn({ method: "GET" })
    .middleware([requiredAuthMiddleware])
    .handler(({ context: { currentUser } }) => {
        return {
            user: {
                id: currentUser.id,
                email: currentUser.email,
                name: currentUser.name,
            },
            providers: listProvidersWithSummary(),
            clients: listConnectedClients(currentUser.id),
            builtins: listBuiltInProviders().map((b) => ({
                key: b.key,
                defaultSlug: b.defaultSlug,
                defaultName: b.defaultName,
                description: b.description,
                configFields: b.configFields,
                toolCount: b.tools.length,
            })),
            logs: listExecutionLogs(100),
        };
    });


export const createProviderFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({
        name: z.string().trim().min(1).max(80),
        slug: z.string().trim().max(48).optional(),
        kind: z.enum(["remote_mcp", "builtin"]),
        url: z.string().trim().optional(),
        authType: z.enum(["none", "oauth", "bearer"]).optional(),
        authSecret: z.string().optional(),
        builtinKey: z.string().optional(),
        config: z.record(z.string(), z.string()).optional(),
        readOnly: z.boolean().optional(),
    }))
    .handler(({ data }) => createProvider(data));


export const updateProviderFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(80).optional(),
        enabled: z.boolean().optional(),
        readOnly: z.boolean().optional(),
        url: z.string().trim().optional(),
        authType: z.enum(["none", "oauth", "bearer"]).optional(),
        authSecret: z.string().optional(),
        config: z.record(z.string(), z.string()).optional(),
    }))
    .handler(({ data }) => updateProvider(data));


export const deleteProviderFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({ id: z.string().min(1) }))
    .handler(({ data }) => {
        deleteProvider(data.id);
        return { ok: true };
    });


export const syncProviderFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({ id: z.string().min(1) }))
    .handler(({ data }) => syncProviderTools(data.id));


export const startProviderOAuthFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({ id: z.string().min(1) }))
    .handler(({ data }) => startUpstreamOAuthFlow(data.id));


export const disconnectProviderOAuthFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({ id: z.string().min(1) }))
    .handler(({ data }) => {
        disconnectProviderOAuth(data.id);
        return { ok: true };
    });


export const toggleProviderToolFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({
        toolId: z.string().min(1),
        enabled: z.boolean(),
    }))
    .handler(({ data }) => {
        toggleProviderTool(data.toolId, data.enabled);
        return { ok: true };
    });


export const getOAuthConsentRequestFn = createServerFn({ method: "GET" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({ oauthQuery: z.string().min(1).max(16384) }))
    .handler(async ({ data }) => {
        const query = new URLSearchParams(data.oauthQuery);
        const clientId = query.get("client_id") ?? "";

        const client = await auth.api.getOAuthClientPublicPrelogin({
            headers: getRequest().headers,
            body: {
                oauth_query: data.oauthQuery,
                client_id: clientId,
            },
        });

        const providers = listProvidersWithSummary()
            .filter((p) => p.enabled)
            .map((p) => ({
                id: p.id,
                slug: p.slug,
                name: p.name,
                kind: p.kind,
                readOnly: p.readOnly,
                toolCount: p.enabledToolCount,
            }));

        return {
            clientId,
            name: client.client_name || "Unnamed assistant",
            callbackOrigin: new URL(query.get("redirect_uri")!).origin,
            scopes: (query.get("scope") ?? "").split(" ").filter(Boolean),
            providers,
        };
    });


export const saveClientPolicyFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({
        clientId: z.string().min(1),
        mode: z.enum(["code", "classic"]),
        readOnly: z.boolean(),
        allowedProviderIds: z.array(z.string()),
    }))
    .handler(({ data }) => {
        saveClientPolicy(data);
        return { ok: true };
    });


export const disconnectClientFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({ clientId: z.string().min(1) }))
    .handler(({ data, context: { currentUser } }) => {
        revokeClientConnection(currentUser.id, data.clientId);
        return { ok: true };
    });


export const playgroundSearchFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({
        query: z.string().optional(),
        providerSlug: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
    }))
    .handler(({ data }) => {
        return searchPermittedTools(
            { allowedProviderIds: null, readOnly: false },
            data,
        );
    });


export const playgroundDescribeFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({
        tools: z.array(z.string().min(1)).min(1).max(20),
    }))
    .handler(({ data }) => {
        const res = describePermittedTools(
            { allowedProviderIds: null, readOnly: false },
            data.tools,
        );
        return {
            tools: res.tools.map(({ inputSchema: _inputSchema, ...rest }) => rest),
            missing: res.missing,
        };
    });


export const playgroundCallFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({
        tool: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
    }))
    .handler(async ({ data }) => {
        const res = await invokePermittedTool(
            { allowedProviderIds: null, readOnly: false, clientName: "Playground" },
            data.tool,
            data.args,
        );
        return {
            isError: res.isError,
            text: res.content.map((c) => c.text).join("\n"),
        };
    });


export const playgroundExecuteFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .validator(z.object({
        code: z.string().min(1).max(32_000),
        timeoutMs: z.number().int().min(1_000).max(60_000).optional(),
    }))
    .handler(async ({ data }) => {
        const res = await executeCodeModeScript(
            { allowedProviderIds: null, readOnly: false, clientName: "Playground" },
            data,
        );
        return {
            resultJson: JSON.stringify(res.result, null, 2),
            logs: res.logs,
            toolCallCount: res.toolCallCount,
            durationMs: res.durationMs,
        };
    });


export const clearLogsFn = createServerFn({ method: "POST" })
    .middleware([requiredAuthMiddleware])
    .handler(() => {
        clearExecutionLogs();
        return { ok: true };
    });
