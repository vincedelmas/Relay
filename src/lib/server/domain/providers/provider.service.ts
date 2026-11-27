import crypto from "node:crypto";
import {db} from "@/lib/server/database/db";
import {logger} from "@/lib/server/core/logger";
import {and, asc, eq, inArray} from "drizzle-orm";
import type {CallToolResult} from "@modelcontextprotocol/sdk/types.js";
import {runQuickJsSandbox} from "@/lib/server/core/sandbox/quickjs";
import {provider, providerTool} from "@/lib/server/database/schema";
import {getBuiltInProvider} from "@/lib/server/domain/providers/builtins";
import {assignUniqueJsNames, toProviderSlug} from "@/lib/utils/identifiers";
import {decryptJson, encryptJson, encryptSecret} from "@/lib/server/core/crypto";
import {recordExecutionLog} from "@/lib/server/domain/logs/execution-log.service";
import {callRemoteMcpTool, listRemoteMcpTools} from "@/lib/server/domain/providers/remote-mcp";
import {clearUpstreamOAuthState, hasStoredUpstreamTokens} from "@/lib/server/domain/providers/upstream-oauth";
import type {GatewayPolicyContext, InvokedToolResponse, ProviderAuthType, ProviderKind} from "@/lib/types/gateway.types";


const AUTO_SYNC_TTL_MS = 5 * 60 * 1000;
const AUTO_SYNC_TIMEOUT_MS = 5_000;
const PROCESS_STARTED_AT = Date.now();

const inFlightSyncs = new Map<string, Promise<void>>();
const lastAutoSyncAttemptAt = new Map<string, number>();


const formatContentText = (content: CallToolResult["content"]): string => {
    return content
        .map((block) => (block.type === "text" ? block.text : JSON.stringify(block)))
        .join("\n");
};


const unwrapMcpToolResult = (raw: {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: CallToolResult["content"];
}): InvokedToolResponse => {
    const normalizedContent: CallToolResult["content"] = raw.content.length > 0
        ? raw.content
        : raw.structuredContent !== undefined
            ? [{ type: "text", text: JSON.stringify(raw.structuredContent) }]
            : [];

    const textBlocks = raw.content.filter(
        (block): block is Extract<CallToolResult["content"][number], { type: "text" }> => block.type === "text",
    );
    const allText = textBlocks.length === raw.content.length;

    let data: unknown;
    if (raw.structuredContent !== undefined) {
        data = raw.structuredContent;
    }
    else if (allText && textBlocks.length === 1) {
        try {
            data = JSON.parse(textBlocks[0].text);
        }
        catch {
            data = textBlocks[0].text;
        }
    }
    else if (allText && textBlocks.length > 1) {
        data = textBlocks.map((b) => b.text);
    }
    else {
        data = raw.content;
    }

    return {
        data,
        content: normalizedContent,
        isError: Boolean(raw.isError),
        structuredContent: raw.structuredContent,
    };
};


export const listProvidersWithSummary = () => {
    const providers = db
        .select()
        .from(provider)
        .orderBy(asc(provider.name))
        .all();

    const tools = db
        .select()
        .from(providerTool)
        .orderBy(asc(providerTool.name))
        .all();

    const toolsByProvider = new Map<string, typeof tools>();
    for (const tool of tools) {
        const list = toolsByProvider.get(tool.providerId) ?? [];
        list.push(tool);
        toolsByProvider.set(tool.providerId, list);
    }

    return providers.map((p) => {
        const providerTools = toolsByProvider.get(p.id) ?? [];
        return {
            id: p.id,
            url: p.url,
            slug: p.slug,
            name: p.name,
            kind: p.kind,
            enabled: p.enabled,
            readOnly: p.readOnly,
            authType: p.authType,
            lastError: p.lastError,
            createdAt: p.createdAt,
            builtinKey: p.builtinKey,
            lastSyncedAt: p.lastSyncedAt,
            toolCount: providerTools.length,
            hasConfig: Boolean(p.encryptedConfig),
            hasAuthSecret: Boolean(p.encryptedAuthSecret),
            enabledToolCount: providerTools.filter((t) => t.enabled).length,
            oauthConnected: p.kind === "remote_mcp" && p.authType === "oauth" ? hasStoredUpstreamTokens(p.id) : false,
            tools: providerTools.map((t) => ({
                id: t.id,
                name: t.name,
                title: t.title,
                jsName: t.jsName,
                enabled: t.enabled,
                readOnly: t.readOnly,
                description: t.description,
                destructive: t.destructive,
                inputSchemaJson: JSON.stringify(t.inputSchema, null, 2),
            })),
        };
    });
};


export const createProvider = async (input: {
    name: string;
    url?: string;
    slug?: string;
    kind: ProviderKind;
    readOnly?: boolean;
    authSecret?: string;
    builtinKey?: string;
    authType?: ProviderAuthType;
    config?: Record<string, string>;
}) => {
    const now = new Date();
    const slug = toProviderSlug(input.slug?.trim() || input.name);

    const existing = db
        .select({ id: provider.id })
        .from(provider)
        .where(eq(provider.slug, slug))
        .get();

    if (existing) {
        throw new Error(`A provider with slug "${slug}" already exists.`);
    }

    if (input.kind === "remote_mcp") {
        if (!input.url?.trim()) throw new Error("Remote MCP providers require an endpoint URL.");
        new URL(input.url.trim());
    }
    else {
        if (!input.builtinKey || !getBuiltInProvider(input.builtinKey)) {
            throw new Error(`Unknown built-in provider "${input.builtinKey ?? ""}".`);
        }
    }

    const id = crypto.randomUUID();
    const encryptedAuthSecret = input.authSecret?.trim() ? await encryptSecret(input.authSecret.trim()) : null;

    const cleanedConfig = input.config
        ? Object.fromEntries(Object.entries(input.config).filter(([, v]) => v.trim().length > 0))
        : undefined;

    const encryptedConfig = cleanedConfig && Object.keys(cleanedConfig).length > 0
        ? await encryptJson(cleanedConfig)
        : null;

    db.insert(provider).values({
        id,
        slug,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        encryptedConfig,
        kind: input.kind,
        encryptedAuthSecret,
        name: input.name.trim(),
        readOnly: input.readOnly ?? false,
        url: input.kind === "remote_mcp" ? input.url!.trim() : null,
        builtinKey: input.kind === "builtin" ? input.builtinKey! : null,
        authType: input.kind === "remote_mcp" ? (input.authType ?? "oauth") : "none",
    }).run();

    // Auto-sync built-in tools or no-auth/bearer remote MCPs immediately
    if (input.kind === "builtin" || (input.kind === "remote_mcp" && input.authType !== "oauth")) {
        try {
            await syncProviderTools(id);
        }
        catch (err) {
            logger.warn({ err, providerId: id }, "Initial tool sync failed");
        }
    }

    return { id, slug };
};


export const updateProvider = async (input: {
    id: string;
    url?: string;
    name?: string;
    enabled?: boolean;
    readOnly?: boolean;
    authSecret?: string;
    authType?: ProviderAuthType;
    config?: Record<string, string>;
}) => {
    const existing = db
        .select()
        .from(provider)
        .where(eq(provider.id, input.id))
        .get();

    if (!existing) throw new Error("Provider not found.");

    const patch: Partial<typeof provider.$inferInsert> = {
        updatedAt: new Date(),
    };

    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.readOnly !== undefined) patch.readOnly = input.readOnly;

    const trimmedUrl = input.url !== undefined && existing.kind === "remote_mcp"
        ? input.url.trim()
        : undefined;
    if (trimmedUrl !== undefined) {
        new URL(trimmedUrl);
        patch.url = trimmedUrl;
    }

    const urlChanged = trimmedUrl !== undefined && trimmedUrl !== existing.url;
    const nextAuthType = input.authType !== undefined && existing.kind === "remote_mcp"
        ? input.authType
        : existing.authType;
    const authTypeChanged = nextAuthType !== existing.authType;

    if (input.authType !== undefined && existing.kind === "remote_mcp") {
        patch.authType = input.authType;
    }

    if (input.authSecret !== undefined) {
        patch.encryptedAuthSecret = input.authSecret.trim()
            ? await encryptSecret(input.authSecret.trim())
            : null;
    }
    else if (urlChanged || (authTypeChanged && nextAuthType !== "bearer")) {
        patch.encryptedAuthSecret = null;
    }

    if (urlChanged) {
        patch.lastSyncedAt = null;
        patch.lastError = null;
    }

    if (input.config !== undefined) {
        const existingConfig = existing.encryptedConfig
            ? await decryptJson<Record<string, string>>(existing.encryptedConfig)
            : {};
        const submitted = Object.fromEntries(
            Object.entries(input.config)
                .map(([k, v]) => [k, v.trim()] as const)
                .filter(([, v]) => v.length > 0),
        );
        const merged = { ...existingConfig, ...submitted };
        patch.encryptedConfig = Object.keys(merged).length > 0 ? await encryptJson(merged) : null;
    }

    db.transaction((tx) => {
        if (urlChanged) {
            tx.delete(providerTool)
                .where(eq(providerTool.providerId, input.id))
                .run();
        }

        tx.update(provider)
            .set(patch)
            .where(eq(provider.id, input.id))
            .run();
    });

    if (urlChanged || (authTypeChanged && nextAuthType !== "oauth")) {
        clearUpstreamOAuthState(input.id);
    }

    lastAutoSyncAttemptAt.delete(input.id);
};


export const deleteProvider = (providerId: string) => {
    lastAutoSyncAttemptAt.delete(providerId);
    db.delete(provider)
        .where(eq(provider.id, providerId))
        .run();
};


export const disconnectProviderOAuth = (providerId: string) => {
    lastAutoSyncAttemptAt.delete(providerId);
    clearUpstreamOAuthState(providerId);
    db.update(provider)
        .set({ lastError: null, updatedAt: new Date() })
        .where(eq(provider.id, providerId))
        .run();
};


export const toggleProviderTool = (toolId: string, enabled: boolean) => {
    db.update(providerTool)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(providerTool.id, toolId))
        .run();
};


export const syncProviderTools = async (providerId: string, options?: { signal?: AbortSignal }): Promise<{ toolCount: number }> => {
    const row = db.select().from(provider).where(eq(provider.id, providerId)).get();
    if (!row) throw new Error("Provider not found.");

    try {
        let fetchedTools: Array<{
            name: string;
            title?: string;
            description: string;
            inputSchema: Record<string, unknown>;
            outputSchema?: Record<string, unknown>;
            readOnly: boolean;
            destructive: boolean;
        }>;

        if (row.kind === "builtin") {
            const def = row.builtinKey ? getBuiltInProvider(row.builtinKey) : undefined;
            if (!def) throw new Error(`Built-in provider "${row.builtinKey}" not registered.`);
            fetchedTools = def.tools.map((t) => ({
                name: t.name,
                title: t.title,
                description: t.description,
                inputSchema: t.inputSchema,
                outputSchema: t.outputSchema,
                readOnly: Boolean(t.readOnly),
                destructive: Boolean(t.destructive),
            }));
        }
        else {
            if (!row.url) throw new Error("Remote MCP provider has no endpoint URL.");
            fetchedTools = await listRemoteMcpTools({
                id: row.id,
                name: row.name,
                url: row.url,
                authType: row.authType,
                encryptedAuthSecret: row.encryptedAuthSecret,
            }, options?.signal);
        }

        const withJsNames = assignUniqueJsNames(
            [...fetchedTools].sort((a, b) => a.name.localeCompare(b.name)),
        );
        const now = new Date();

        const committed = db.transaction((tx) => {
            const current = tx.select({
                url: provider.url,
                kind: provider.kind,
                authType: provider.authType,
                builtinKey: provider.builtinKey,
            }).from(provider).where(eq(provider.id, row.id)).get();

            if (
                !current
                || current.kind !== row.kind
                || current.url !== row.url
                || current.authType !== row.authType
                || current.builtinKey !== row.builtinKey
            ) {
                return false;
            }

            const existingTools = tx.select({
                name: providerTool.name,
                enabled: providerTool.enabled,
            }).from(providerTool).where(eq(providerTool.providerId, row.id)).all();

            const enabledByName = new Map(existingTools.map((t) => [t.name, t.enabled]));

            tx.delete(providerTool).where(eq(providerTool.providerId, row.id)).run();

            for (const tool of withJsNames) {
                tx.insert(providerTool).values({
                    id: `${row.id}:${tool.name}`,
                    providerId: row.id,
                    name: tool.name,
                    jsName: tool.jsName,
                    title: tool.title ?? null,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    outputSchema: tool.outputSchema ?? null,
                    readOnly: tool.readOnly,
                    destructive: tool.destructive,
                    enabled: enabledByName.get(tool.name) ?? true,
                    updatedAt: now,
                }).run();
            }

            tx.update(provider)
                .set({ lastSyncedAt: now, lastError: null, updatedAt: now })
                .where(eq(provider.id, row.id))
                .run();

            return true;
        });

        if (!committed) {
            logger.info({ providerId: row.id, provider: row.slug }, "Discarded stale tool sync after provider configuration changed");
            return { toolCount: 0 };
        }

        return { toolCount: withJsNames.length };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const current = db.select({
            url: provider.url,
            authType: provider.authType,
        }).from(provider).where(eq(provider.id, row.id)).get();

        if (current && current.url === row.url && current.authType === row.authType) {
            db.update(provider)
                .set({ lastError: message.slice(0, 500), updatedAt: new Date() })
                .where(eq(provider.id, row.id))
                .run();
        }
        throw err;
    }
};


const getPermittedProviders = (policy: GatewayPolicyContext) => {
    const enabledProviders = db.select().from(provider).where(eq(provider.enabled, true)).orderBy(asc(provider.slug)).all();
    if (policy.allowedProviderIds === null) return enabledProviders;

    const allowed = new Set(policy.allowedProviderIds);
    return enabledProviders.filter((p) => allowed.has(p.id));
};


export const ensureFreshProviderTools = async (policy: GatewayPolicyContext): Promise<void> => {
    const providers = getPermittedProviders(policy);
    const now = Date.now();
    const tasks: Array<Promise<void>> = [];

    for (const p of providers) {
        const existingSync = inFlightSyncs.get(p.id);
        if (existingSync) {
            tasks.push(existingSync);
            continue;
        }

        if (p.kind === "remote_mcp") {
            if (!p.url) continue;
            if (p.authType === "oauth" && !hasStoredUpstreamTokens(p.id)) continue;
            if (p.authType === "bearer" && !p.encryptedAuthSecret) continue;
        }

        const lastSyncedMs = p.lastSyncedAt?.getTime() ?? 0;
        const isStale = p.kind === "builtin"
            ? lastSyncedMs < PROCESS_STARTED_AT
            : now - lastSyncedMs >= AUTO_SYNC_TTL_MS;

        if (!isStale) continue;

        const lastAttemptMs = lastAutoSyncAttemptAt.get(p.id) ?? 0;
        if (now - lastAttemptMs < AUTO_SYNC_TTL_MS) continue;

        lastAutoSyncAttemptAt.set(p.id, now);
        const task = syncProviderTools(p.id, { signal: AbortSignal.timeout(AUTO_SYNC_TIMEOUT_MS) })
            .then(() => undefined)
            .catch((err: unknown) => {
                logger.warn({ err, providerId: p.id, provider: p.slug }, "Auto-sync failed; serving cached tools");
            })
            .finally(() => {
                inFlightSyncs.delete(p.id);
            });

        inFlightSyncs.set(p.id, task);
        tasks.push(task);
    }

    if (tasks.length > 0) {
        await Promise.all(tasks);
    }
};


export const listPermittedTools = (policy: GatewayPolicyContext) => {
    const providers = getPermittedProviders(policy);
    if (providers.length === 0) return [];

    const providerMap = new Map(providers.map((p) => [p.id, p]));
    const rows = db.select()
        .from(providerTool)
        .where(and(
            inArray(providerTool.providerId, providers.map((p) => p.id)),
            eq(providerTool.enabled, true),
        ))
        .orderBy(asc(providerTool.name))
        .all();

    return rows
        .filter((tool) => {
            const p = providerMap.get(tool.providerId)!;
            return !(policy.readOnly || p.readOnly) || tool.readOnly;
        })
        .map((tool) => {
            const p = providerMap.get(tool.providerId)!;
            return {
                classicName: `${p.slug}__${tool.jsName}`,
                providerSlug: p.slug,
                toolName: tool.name,
                jsName: tool.jsName,
                title: tool.title,
                description: `[${p.name}] ${tool.description || tool.title || tool.name}`,
                inputSchema: tool.inputSchema,
                readOnly: tool.readOnly,
                destructive: tool.destructive,
            };
        });
};


const resolvePermittedTool = (
    policy: GatewayPolicyContext,
    identifier: string,
): { providerRow: typeof provider.$inferSelect; toolRow: typeof providerTool.$inferSelect } => {
    const trimmed = identifier.trim();
    const providers = getPermittedProviders(policy);

    const candidates: Array<{ providerRow: typeof provider.$inferSelect; toolKey: string; exactJsNameOnly: boolean }> = [];

    // Prefer exact advertised `${slug}__${jsName}` prefix matches (longest slug first handles slugs ending in `_`, e.g. `default_`)
    const prefixMatches = providers
        .filter((p) => trimmed.startsWith(`${p.slug}__`))
        .sort((a, b) => b.slug.length - a.slug.length);

    for (const providerRow of prefixMatches) {
        candidates.push({
            providerRow,
            toolKey: trimmed.slice(providerRow.slug.length + 2),
            exactJsNameOnly: true,
        });
    }

    if (candidates.length === 0) {
        const bySlug = new Map(providers.map((p) => [p.slug, p]));
        const sepIdx = trimmed.includes(".") ? trimmed.indexOf(".") : trimmed.indexOf(":");
        if (sepIdx > 0) {
            const providerRow = bySlug.get(trimmed.slice(0, sepIdx));
            if (providerRow) {
                candidates.push({
                    providerRow,
                    toolKey: trimmed.slice(sepIdx + 1),
                    exactJsNameOnly: false,
                });
            }
        }
    }

    if (candidates.length === 0) {
        throw new Error(`Tool "${identifier}" is not permitted or its provider is disabled.`);
    }

    let resolved: { providerRow: typeof provider.$inferSelect; toolRow: typeof providerTool.$inferSelect } | undefined;

    for (const candidate of candidates) {
        const providerTools = db.select()
            .from(providerTool)
            .where(and(eq(providerTool.providerId, candidate.providerRow.id), eq(providerTool.enabled, true)))
            .all();

        const exactMatch = providerTools.find((t) => t.jsName === candidate.toolKey);
        const toolRow = exactMatch ?? (candidate.exactJsNameOnly ? undefined : providerTools.find((t) => t.name === candidate.toolKey));

        if (toolRow) {
            resolved = { providerRow: candidate.providerRow, toolRow };
            break;
        }
    }

    if (!resolved) {
        throw new Error(`Tool "${identifier}" not found or disabled on provider "${candidates[0].providerRow.slug}".`);
    }

    if ((policy.readOnly || resolved.providerRow.readOnly) && !resolved.toolRow.readOnly) {
        throw new Error(`Tool "${resolved.providerRow.slug}.${resolved.toolRow.jsName}" is blocked because read-only mode is active.`);
    }

    return resolved;
};


const getPermittedToolManifest = (policy: GatewayPolicyContext): Record<string, string[]> => {
    const providers = getPermittedProviders(policy);
    if (providers.length === 0) return {};

    const providerMap = new Map(providers.map((p) => [p.id, p]));
    const rows = db.select()
        .from(providerTool)
        .where(and(
            inArray(providerTool.providerId, providers.map((p) => p.id)),
            eq(providerTool.enabled, true),
        ))
        .all();

    const manifest: Record<string, string[]> = {};
    for (const row of rows) {
        const p = providerMap.get(row.providerId)!;
        if ((policy.readOnly || p.readOnly) && !row.readOnly) continue;
        manifest[p.slug] ??= [];
        manifest[p.slug].push(row.jsName);
    }
    return manifest;
};


export const invokePermittedTool = async (
    policy: GatewayPolicyContext,
    identifier: string,
    args: Record<string, unknown>,
    options?: { signal?: AbortSignal; logExecution?: boolean },
): Promise<InvokedToolResponse> => {
    const startedAt = Date.now();
    const signal = options?.signal ?? AbortSignal.timeout(30_000);
    let resolvedProviderSlug: string | null = null;
    let resolvedToolName: string | null = null;

    try {
        const { providerRow, toolRow } = resolvePermittedTool(policy, identifier);
        resolvedProviderSlug = providerRow.slug;
        resolvedToolName = toolRow.name;

        let response: InvokedToolResponse;

        if (providerRow.kind === "builtin") {
            const def = providerRow.builtinKey ? getBuiltInProvider(providerRow.builtinKey) : undefined;
            const impl = def?.tools.find((t) => t.name === toolRow.name);
            if (!impl) {
                throw new Error(`Built-in tool "${providerRow.slug}.${toolRow.name}" is unavailable.`);
            }
            const config = providerRow.encryptedConfig
                ? await decryptJson<Record<string, string>>(providerRow.encryptedConfig)
                : {};
            const data = await impl.execute(args, { config, signal });
            const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
            response = {
                data,
                content: [{ type: "text", text }],
                structuredContent: data && typeof data === "object" && !Array.isArray(data)
                    ? (data as Record<string, unknown>)
                    : undefined,
                isError: false,
            };
        }
        else {
            if (!providerRow.url) throw new Error(`Provider "${providerRow.name}" has no endpoint URL.`);
            const remoteResult = await callRemoteMcpTool({
                id: providerRow.id,
                name: providerRow.name,
                url: providerRow.url,
                authType: providerRow.authType,
                encryptedAuthSecret: providerRow.encryptedAuthSecret,
            }, toolRow.name, args, signal);

            response = unwrapMcpToolResult(remoteResult);
        }

        if (options?.logExecution !== false) {
            recordExecutionLog({
                clientId: policy.clientId,
                clientName: policy.clientName,
                kind: "call",
                providerSlug: resolvedProviderSlug,
                toolName: resolvedToolName,
                toolCallCount: 1,
                status: response.isError ? "error" : "ok",
                errorMessage: response.isError ? formatContentText(response.content) : null,
                durationMs: Date.now() - startedAt,
            });
        }

        return response;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (options?.logExecution !== false) {
            recordExecutionLog({
                clientId: policy.clientId,
                clientName: policy.clientName,
                kind: "call",
                providerSlug: resolvedProviderSlug,
                toolName: resolvedToolName ?? identifier,
                toolCallCount: 1,
                status: "error",
                errorMessage: message,
                durationMs: Date.now() - startedAt,
            });
        }
        throw err;
    }
};


export const executeSandboxScript = async (
    policy: GatewayPolicyContext,
    input: { code: string; timeoutMs?: number; maxToolCalls?: number },
) => {
    const startedAt = Date.now();
    const manifest = getPermittedToolManifest(policy);
    let trackedCalls = 0;

    try {
        const sandboxResult = await runQuickJsSandbox({
            code: input.code,
            toolManifest: manifest,
            limits: {
                wallTimeoutMs: input.timeoutMs,
                maxToolCalls: input.maxToolCalls,
            },
            callTool: async (providerSlug, jsName, args, signal) => {
                trackedCalls += 1;
                const result = await invokePermittedTool(policy, `${providerSlug}.${jsName}`, args, {
                    signal,
                    logExecution: false,
                });
                if (result.isError) {
                    throw new Error(formatContentText(result.content) || `Tool ${providerSlug}.${jsName} returned an error.`);
                }
                return result.data;
            },
        });

        recordExecutionLog({
            clientId: policy.clientId,
            clientName: policy.clientName,
            kind: "execute",
            code: input.code,
            toolCallCount: sandboxResult.toolCallCount,
            status: "ok",
            durationMs: sandboxResult.durationMs,
        });

        return sandboxResult;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        recordExecutionLog({
            clientId: policy.clientId,
            clientName: policy.clientName,
            kind: "execute",
            code: input.code,
            toolCallCount: trackedCalls,
            status: "error",
            errorMessage: message,
            durationMs: Date.now() - startedAt,
        });
        throw err;
    }
};
