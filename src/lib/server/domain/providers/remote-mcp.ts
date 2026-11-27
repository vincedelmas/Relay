import {decryptSecret} from "@/lib/server/core/crypto";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import type {CallToolResult} from "@modelcontextprotocol/sdk/types.js";
import {UnauthorizedError} from "@modelcontextprotocol/sdk/client/auth.js";
import type {FetchLike} from "@modelcontextprotocol/sdk/shared/transport.js";
import type {RemoteProviderDescriptor, UpstreamToolInfo} from "@/lib/types/gateway.types";
import {StreamableHTTPClientTransport, StreamableHTTPError} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {ensureFreshUpstreamTokens, RelayUpstreamOAuthProvider, UpstreamReauthRequiredError} from "@/lib/server/domain/providers/upstream-oauth";


const isAuthFailure = (err: unknown): boolean => {
    if (err instanceof UnauthorizedError) return true;
    return err instanceof StreamableHTTPError && err.code === 401;
};


const createSafeError = (providerName: string, err: unknown): Error => {
    if (err instanceof UpstreamReauthRequiredError) return err;

    if (err instanceof UnauthorizedError) {
        return new UpstreamReauthRequiredError(providerName, "unauthorized");
    }

    if (err instanceof StreamableHTTPError) {
        return new Error(`Upstream "${providerName}" HTTP error (${err.code ?? "unknown"})`);
    }

    if (err instanceof Error) {
        // Strip potential bearer tokens from upstream error strings
        const sanitized = err.message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [Redacted]");
        return new Error(`Upstream "${providerName}" error: ${sanitized}`);
    }

    return new Error(`Upstream "${providerName}" request failed`);
};


const withRemoteClient = async <T>(descriptor: RemoteProviderDescriptor, action: (client: Client) => Promise<T>, signal?: AbortSignal): Promise<T> => {
    const runOnce = async (): Promise<T> => {
        const headers: Record<string, string> = {};
        let authProvider: RelayUpstreamOAuthProvider | undefined;

        if (descriptor.authType === "bearer") {
            if (!descriptor.encryptedAuthSecret) {
                throw new Error(`Provider "${descriptor.name}" is configured for Bearer auth but has no token set.`);
            }

            const token = await decryptSecret(descriptor.encryptedAuthSecret);
            headers.Authorization = `Bearer ${token}`;
        }
        else if (descriptor.authType === "oauth") {
            await ensureFreshUpstreamTokens(descriptor, { signal });
            authProvider = new RelayUpstreamOAuthProvider(descriptor.id, descriptor.name, false);
        }

        const customFetch: FetchLike = (input, init) => {
            const combinedSignal = signal && init?.signal
                ? AbortSignal.any([signal, init.signal])
                : (signal ?? init?.signal);

            return fetch(input, { ...init, signal: combinedSignal });
        };

        const transport = new StreamableHTTPClientTransport(new URL(descriptor.url), {
            authProvider,
            fetch: customFetch,
            requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
        });

        const client = new Client({ name: "relay-gateway", version: "0.1.0" }, { capabilities: {} });

        try {
            await client.connect(transport);
            return await action(client);
        }
        finally {
            await client.close().catch(() => {
            });
        }
    };

    try {
        return await runOnce();
    }
    catch (err) {
        if (descriptor.authType === "oauth" && isAuthFailure(err)) {
            await ensureFreshUpstreamTokens(descriptor, { force: true, signal });
            try {
                return await runOnce();
            }
            catch (retryErr) {
                throw createSafeError(descriptor.name, retryErr);
            }
        }
        throw createSafeError(descriptor.name, err);
    }
};


export const listRemoteMcpTools = async (descriptor: RemoteProviderDescriptor, signal?: AbortSignal): Promise<UpstreamToolInfo[]> => {
    return withRemoteClient(descriptor, async (client) => {
        let cursor: string | undefined;
        const tools: UpstreamToolInfo[] = [];

        do {
            const page = await client.listTools(cursor ? { cursor } : undefined);

            for (const tool of page.tools) {
                tools.push({
                    name: tool.name,
                    description: tool.description ?? "",
                    title: tool.title ?? tool.annotations?.title,
                    readOnly: Boolean(tool.annotations?.readOnlyHint),
                    destructive: Boolean(tool.annotations?.destructiveHint),
                    outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
                    inputSchema: (tool.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
                });
            }
            cursor = page.nextCursor;
        } while (cursor);

        return tools;
    }, signal);
};


export const callRemoteMcpTool = async (
    descriptor: RemoteProviderDescriptor,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<{ content: CallToolResult["content"]; structuredContent?: Record<string, unknown>; isError?: boolean }> => {
    return withRemoteClient(descriptor, async (client) => {
        const result = await client.callTool({ name: toolName, arguments: args }, undefined, { signal });

        return {
            isError: Boolean(result.isError),
            structuredContent: result.structuredContent as Record<string, unknown> | undefined,
            content: Array.isArray(result.content) ? (result.content as CallToolResult["content"]) : [],
        };
    }, signal);
};
