import * as z from "zod";
import {auth} from "@/lib/server/core/auth";
import {requireMcpAuth} from "@better-auth/mcp";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {MCP_ACCESS_SCOPE, MCP_RESOURCE, MCP_SCOPES} from "@/lib/server/core/mcp/config";
import {CallToolRequestSchema, ListToolsRequestSchema} from "@modelcontextprotocol/sdk/types.js";
import {getMcpClientAccess, type McpClientAccess} from "@/lib/server/domain/clients/client-policy.service";
import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
    describePermittedTools,
    executeCodeModeScript,
    type GatewayPolicyContext,
    invokePermittedTool,
    listPermittedClassicTools,
    searchPermittedTools,
} from "@/lib/server/domain/providers/provider.service";


const unauthorizedJsonRpc = (message: string) => new Response(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
}), {
    status: 401,
    headers: { "Content-Type": "application/json" },
});


const toPolicyContext = (access: McpClientAccess): GatewayPolicyContext => ({
    readOnly: access.readOnly,
    clientId: access.clientId,
    clientName: access.clientName,
    allowedProviderIds: access.allowedProviderIds,
});


const configureCodeModeServer = (server: McpServer, policy: GatewayPolicyContext) => {
    server.registerTool("search", {
        title: "Search Tools",
        annotations: { readOnlyHint: true },
        description: "Search available tools across connected providers using BM25 full-text search. " +
            "Pass an empty query or '*' to list available providers and tools.",
        inputSchema: {
            query: z.string().optional()
                .describe("Keywords to search (e.g. 'steam playtime', 'recipe', 'cloudflare dns'). Omit or '*' to browse."),
            provider: z.string().optional()
                .describe("Optional provider slug filter (e.g. 'steam', 'mylists')."),
            limit: z.number().int().min(1).max(50).optional()
                .describe("Max results to return (default 15)."),
        },
    }, async ({ query, provider: providerSlug, limit }) => {
        const result = searchPermittedTools(policy, { query, providerSlug, limit });

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2), }] };
    });

    server.registerTool("describe", {
        title: "Describe Tools",
        annotations: { readOnlyHint: true },
        description: "Get compact TypeScript call signatures and parameter details for one or more tools before calling or scripting them.",
        inputSchema: {
            tools: z.array(z.string().min(1)).min(1).max(20)
                .describe("Tool identifiers returned by search (e.g. ['steam.get_owned_games'])."),
        },
    }, async ({ tools: toolIds }) => {
        const result = describePermittedTools(policy, toolIds);
        const sections = result.tools.map((t) => `// ${t.id}\n${t.signature}`);

        if (result.missing.length > 0) {
            sections.push(`// Unavailable or unauthorized: ${result.missing.join(", ")}`);
        }

        return { content: [{ type: "text", text: sections.join("\n\n") || "No matching tools available." }] };
    });

    server.registerTool("call", {
        title: "Call Single Tool",
        description: "Directly invoke a single tool by its identifier (e.g. 'steam.get_owned_games') without launching the JS sandbox.",
        inputSchema: {
            tool: z.string().min(1)
                .describe("Tool identifier in 'provider.tool' format."),
            args: z.record(z.string(), z.unknown()).optional()
                .describe("JSON object arguments matching the tool's signature."),
        },
    }, async ({ tool, args }, extra) => {
        try {
            const response = await invokePermittedTool(policy, tool, args ?? {}, {
                signal: extra.signal,
            });

            return {
                content: response.content,
                isError: response.isError,
            };
        }
        catch (err) {
            return {
                isError: true,
                content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            };
        }
    });

    server.registerTool("execute", {
        title: "Execute Code Mode Script",
        description: [
            "Execute an async JavaScript snippet inside a fresh QuickJS WASM sandbox with direct access to permitted tools.",
            "Call tools via `await tools.<provider>.<tool>(args)` or `await callTool('provider.tool', args)` and use `return ...` " +
            "to return the final JSON result.",
            "Supports Promise.all(), filtering, aggregation, and console.log(). No network/filesystem/host globals exist.",
        ].join(" "),
        inputSchema: {
            code: z.string().min(1).max(32_000)
                .describe("Async JS function body. Use `await tools.<provider>.<tool>(args)` and `return <result>`."),
            timeoutMs: z.number().int().min(1_000).max(60_000).optional()
                .describe("Wall-clock timeout in ms (default 45000, max 60000)."),
        },
    }, async ({ code, timeoutMs }) => {
        try {
            const result = await executeCodeModeScript(policy, { code, timeoutMs });
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                isError: true,
                content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            };
        }
    });
};


const configureClassicModeServer = (server: McpServer, policy: GatewayPolicyContext) => {
    server.server.registerCapabilities({ tools: {} });

    server.server.setRequestHandler(ListToolsRequestSchema, async () => {
        const tools = listPermittedClassicTools(policy);
        return {
            tools: tools.map((tool) => ({
                name: tool.classicName,
                description: tool.description,
                title: tool.title ?? undefined,
                inputSchema: {
                    type: "object" as const,
                    ...tool.inputSchema,
                },
                annotations: {
                    readOnlyHint: tool.readOnly,
                    destructiveHint: tool.destructive,
                },
            })),
        };
    });

    server.server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
        const toolName = req.params.name;
        const args = (req.params.arguments ?? {}) as Record<string, unknown>;

        try {
            const response = await invokePermittedTool(policy, toolName, args, {
                signal: extra.signal,
            });
            return {
                content: response.content,
                isError: response.isError,
            };
        }
        catch (err) {
            return {
                isError: true,
                content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            };
        }
    });
};


export const handleMcpRequest = requireMcpAuth(auth, async (request, accessTokenClaims) => {
    const access = getMcpClientAccess(accessTokenClaims);
    if (!access) return unauthorizedJsonRpc("Access token grant has been revoked or expired.");

    const policy = toPolicyContext(access);
    const instructions = access.mode === "code"
        ? "Relay Personal MCP Gateway (Code Mode). Use `search` to discover tools, `describe` for TypeScript signatures, " +
        "`call` for single calls, or `execute` to orchestrate multiple calls in QuickJS."
        : "Relay Personal MCP Gateway (Classic Mode). All permitted upstream and built-in tools are exposed directly.";

    const server = new McpServer({ name: "Relay", version: "0.1.0" }, { instructions });

    if (access.mode === "code") configureCodeModeServer(server, policy);
    else configureClassicModeServer(server, policy);

    const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
    });

    try {
        await server.connect(transport);
        return await transport.handleRequest(request);
    }
    finally {
        await server.close();
    }
}, {
    resource: MCP_RESOURCE,
    challengeScopes: MCP_SCOPES,
    requiredScopes: [MCP_ACCESS_SCOPE],
});
