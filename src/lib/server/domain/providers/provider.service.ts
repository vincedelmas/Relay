import crypto from "node:crypto";
import {db} from "@/lib/server/database/db";
import {logger} from "@/lib/server/core/logger";
import {and, asc, eq, inArray, sql} from "drizzle-orm";
import {runQuickJsSandbox} from "@/lib/server/core/sandbox/quickjs";
import {provider, providerTool} from "@/lib/server/database/schema";
import {getBuiltInProvider} from "@/lib/server/domain/providers/builtins";
import {assignUniqueJsNames, toProviderSlug} from "@/lib/utils/identifiers";
import {decryptJson, encryptJson, encryptSecret} from "@/lib/server/core/crypto";
import {recordExecutionLog} from "@/lib/server/domain/logs/execution-log.service";
import {extractSchemaSearchTerms, renderToolSignature} from "@/lib/utils/json-schema-ts";
import {callRemoteMcpTool, listRemoteMcpTools} from "@/lib/server/domain/providers/remote-mcp";
import {clearUpstreamOAuthState, hasStoredUpstreamTokens} from "@/lib/server/domain/providers/upstream-oauth";
import type {GatewayPolicyContext, InvokedToolResponse, ProviderAuthType, ProviderKind, ToolDescriptionEntry, ToolSearchHit} from "@/lib/types/gateway.types";


const sanitizeFtsQuery = (raw: string): string | null => {
    const tokens = raw
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 0)
        .slice(0, 12);

    if (tokens.length === 0) return null;
    return tokens.map((token) => `"${token}"*`).join(" OR ");
};


const unwrapMcpToolResult = (raw: {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: Array<{ type: string; text?: string }>;
}): InvokedToolResponse => {
    const textBlocks = raw.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string");

    const normalizedContent: Array<{ type: "text"; text: string }> = textBlocks.length > 0
        ? textBlocks
        : raw.structuredContent
            ? [{ type: "text", text: JSON.stringify(raw.structuredContent) }]
            : [{ type: "text", text: JSON.stringify(raw.content) }];

    let data: unknown;
    if (raw.structuredContent !== undefined) {
        data = raw.structuredContent;
    }
    else if (textBlocks.length === 1) {
        try {
            data = JSON.parse(textBlocks[0].text);
        }
        catch {
            data = textBlocks[0].text;
        }
    }
    else if (textBlocks.length > 1) {
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

    if (input.url !== undefined && existing.kind === "remote_mcp") {
        new URL(input.url.trim());
        patch.url = input.url.trim();
    }

    if (input.authType !== undefined && existing.kind === "remote_mcp") {
        patch.authType = input.authType;
    }

    if (input.authSecret !== undefined) {
        patch.encryptedAuthSecret = input.authSecret.trim()
            ? await encryptSecret(input.authSecret.trim())
            : null;
    }

    if (input.config !== undefined) {
        const cleaned = Object.fromEntries(Object.entries(input.config).filter(([, v]) => v.trim().length > 0));
        patch.encryptedConfig = Object.keys(cleaned).length > 0 ? await encryptJson(cleaned) : null;
    }

    db.update(provider)
        .set(patch)
        .where(eq(provider.id, input.id))
        .run();
};


export const deleteProvider = (providerId: string) => {
    db.transaction((tx) => {
        const toolIds = tx.select({ id: providerTool.id })
            .from(providerTool)
            .where(eq(providerTool.providerId, providerId))
            .all()
            .map((t) => t.id);

        for (const toolId of toolIds) {
            tx.run(sql`DELETE FROM provider_tool_fts WHERE tool_id = ${toolId}`);
        }

        tx.delete(provider)
            .where(eq(provider.id, providerId))
            .run();
    });
};


export const disconnectProviderOAuth = (providerId: string) => {
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


export const syncProviderTools = async (providerId: string): Promise<{ toolCount: number }> => {
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
            });
        }

        const withJsNames = assignUniqueJsNames(fetchedTools);
        const now = new Date();

        db.transaction((tx) => {
            const existingTools = tx.select({
                id: providerTool.id,
                name: providerTool.name,
                enabled: providerTool.enabled,
            }).from(providerTool).where(eq(providerTool.providerId, row.id)).all();

            const enabledByName = new Map(existingTools.map((t) => [t.name, t.enabled]));

            for (const old of existingTools) {
                tx.run(sql`DELETE FROM provider_tool_fts WHERE tool_id = ${old.id}`);
            }
            tx.delete(providerTool).where(eq(providerTool.providerId, row.id)).run();

            for (const tool of withJsNames) {
                const toolId = `${row.id}:${tool.name}`;
                tx.insert(providerTool).values({
                    id: toolId,
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

                const schemaKeys = extractSchemaSearchTerms(tool.inputSchema);
                tx.run(sql`
                    INSERT INTO provider_tool_fts (tool_id, provider_slug, name, js_name, title, description, schema_keys)
                    VALUES (${toolId}, ${row.slug}, ${tool.name}, ${tool.jsName}, ${tool.title ?? ""}, ${tool.description}, ${schemaKeys})
                `);
            }

            tx.update(provider)
                .set({ lastSyncedAt: now, lastError: null, updatedAt: now })
                .where(eq(provider.id, row.id))
                .run();
        });

        return { toolCount: withJsNames.length };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        db.update(provider)
            .set({ lastError: message.slice(0, 500), updatedAt: new Date() })
            .where(eq(provider.id, row.id))
            .run();
        throw err;
    }
};


const getPermittedProviders = (policy: GatewayPolicyContext) => {
    const enabledProviders = db.select().from(provider).where(eq(provider.enabled, true)).orderBy(asc(provider.slug)).all();
    if (policy.allowedProviderIds === null) return enabledProviders;

    const allowed = new Set(policy.allowedProviderIds);
    return enabledProviders.filter((p) => allowed.has(p.id));
};


export const listPermittedClassicTools = (policy: GatewayPolicyContext) => {
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


export const searchPermittedTools = (
    policy: GatewayPolicyContext,
    options: { query?: string; providerSlug?: string; limit?: number },
): { providers: Array<{ slug: string; name: string; readOnly: boolean }>; tools: ToolSearchHit[] } => {
    let providers = getPermittedProviders(policy);
    if (options.providerSlug?.trim()) {
        const target = toProviderSlug(options.providerSlug);
        providers = providers.filter((p) => p.slug === target);
    }

    const providerSummaries = providers.map((p) => ({
        slug: p.slug,
        name: p.name,
        readOnly: policy.readOnly || p.readOnly,
    }));

    if (providers.length === 0) {
        return { providers: [], tools: [] };
    }

    const providerMap = new Map(providers.map((p) => [p.id, p]));
    const limit = Math.max(1, Math.min(50, options.limit ?? 15));
    const ftsQuery = options.query && options.query.trim() !== "*"
        ? sanitizeFtsQuery(options.query)
        : null;

    let candidateRows: Array<typeof providerTool.$inferSelect>;

    if (ftsQuery) {
        const ftsMatches = db.all<{ tool_id: string }>(sql`
            SELECT tool_id
            FROM provider_tool_fts
            WHERE provider_tool_fts MATCH ${ftsQuery}
            ORDER BY bm25(provider_tool_fts, 0.0, 2.0, 5.0, 4.0, 3.0, 1.5, 1.0)
            LIMIT ${limit * 4}
        `);

        if (ftsMatches.length === 0) {
            return { providers: providerSummaries, tools: [] };
        }

        const matchedIds = ftsMatches.map((m) => m.tool_id);
        const rankById = new Map(matchedIds.map((id, idx) => [id, idx]));

        candidateRows = db.select()
            .from(providerTool)
            .where(and(
                inArray(providerTool.id, matchedIds),
                inArray(providerTool.providerId, providers.map((p) => p.id)),
                eq(providerTool.enabled, true),
            ))
            .all()
            .sort((a, b) => (rankById.get(a.id) ?? 999) - (rankById.get(b.id) ?? 999));
    }
    else {
        candidateRows = db.select()
            .from(providerTool)
            .where(and(
                inArray(providerTool.providerId, providers.map((p) => p.id)),
                eq(providerTool.enabled, true),
            ))
            .orderBy(asc(providerTool.providerId), asc(providerTool.name))
            .all();
    }

    const hits: ToolSearchHit[] = [];
    for (const tool of candidateRows) {
        const p = providerMap.get(tool.providerId);
        if (!p) continue;
        if ((policy.readOnly || p.readOnly) && !tool.readOnly) continue;

        hits.push({
            id: `${p.slug}.${tool.jsName}`,
            providerSlug: p.slug,
            providerName: p.name,
            toolName: tool.name,
            jsName: tool.jsName,
            jsCall: `tools.${p.slug}.${tool.jsName}`,
            title: tool.title,
            description: tool.description,
            readOnly: tool.readOnly,
            destructive: tool.destructive,
        });

        if (hits.length >= limit) break;
    }

    return { providers: providerSummaries, tools: hits };
};


const resolvePermittedTool = (
    policy: GatewayPolicyContext,
    identifier: string,
): { providerRow: typeof provider.$inferSelect; toolRow: typeof providerTool.$inferSelect } => {
    const trimmed = identifier.trim();
    const providers = getPermittedProviders(policy);
    const bySlug = new Map(providers.map((p) => [p.slug, p]));

    let providerSlug = "";
    let toolKey = "";

    if (trimmed.includes("__")) {
        const idx = trimmed.indexOf("__");
        providerSlug = trimmed.slice(0, idx);
        toolKey = trimmed.slice(idx + 2);
    }
    else if (trimmed.includes(".")) {
        const idx = trimmed.indexOf(".");
        providerSlug = trimmed.slice(0, idx);
        toolKey = trimmed.slice(idx + 1);
    }
    else if (trimmed.includes(":")) {
        const idx = trimmed.indexOf(":");
        providerSlug = trimmed.slice(0, idx);
        toolKey = trimmed.slice(idx + 1);
    }

    const providerRow = bySlug.get(providerSlug);
    if (!providerRow) {
        throw new Error(`Tool "${identifier}" is not permitted or its provider is disabled.`);
    }

    const providerTools = db.select()
        .from(providerTool)
        .where(and(eq(providerTool.providerId, providerRow.id), eq(providerTool.enabled, true)))
        .all();

    const toolRow = providerTools.find((t) => t.jsName === toolKey || t.name === toolKey);
    if (!toolRow) {
        throw new Error(`Tool "${identifier}" not found or disabled on provider "${providerRow.slug}".`);
    }

    if ((policy.readOnly || providerRow.readOnly) && !toolRow.readOnly) {
        throw new Error(`Tool "${providerRow.slug}.${toolRow.jsName}" is blocked because read-only mode is active.`);
    }

    return { providerRow, toolRow };
};


export const describePermittedTools = (
    policy: GatewayPolicyContext,
    identifiers: string[],
): { tools: ToolDescriptionEntry[]; missing: string[] } => {
    const tools: ToolDescriptionEntry[] = [];
    const missing: string[] = [];

    for (const id of identifiers.slice(0, 20)) {
        try {
            const { providerRow, toolRow } = resolvePermittedTool(policy, id);
            tools.push({
                id: `${providerRow.slug}.${toolRow.jsName}`,
                providerSlug: providerRow.slug,
                toolName: toolRow.name,
                jsName: toolRow.jsName,
                title: toolRow.title,
                description: toolRow.description,
                readOnly: toolRow.readOnly,
                destructive: toolRow.destructive,
                signature: renderToolSignature({
                    providerSlug: providerRow.slug,
                    jsName: toolRow.jsName,
                    description: toolRow.description,
                    inputSchema: toolRow.inputSchema,
                    outputSchema: toolRow.outputSchema,
                    readOnly: toolRow.readOnly,
                    destructive: toolRow.destructive,
                }),
                inputSchema: toolRow.inputSchema,
            });
        }
        catch {
            missing.push(id);
        }
    }

    return { tools, missing };
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
                errorMessage: response.isError ? response.content.map((c) => c.text).join("\n") : null,
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


export const executeCodeModeScript = async (
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
                    throw new Error(result.content.map((c) => c.text).join("\n") || `Tool ${providerSlug}.${jsName} returned an error.`);
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
