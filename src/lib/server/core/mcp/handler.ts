import * as z from "zod";
import {auth} from "@/lib/server/core/auth";
import {requireMcpAuth} from "@better-auth/mcp";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {getMcpClientAccess} from "@/lib/server/domain/clients/client-policy.service";
import type {GatewayPolicyContext, McpClientAccess} from "@/lib/types/gateway.types";
import {MCP_ACCESS_SCOPE, MCP_RESOURCE, MCP_SCOPES} from "@/lib/server/core/mcp/config";
import {CallToolRequestSchema, ListToolsRequestSchema, type Tool} from "@modelcontextprotocol/sdk/types.js";
import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {ensureFreshProviderTools, executeSandboxScript, invokePermittedTool, listPermittedTools} from "@/lib/server/domain/providers/provider.service";


const EXECUTE_TOOL_NAME = "execute";

const executeArgsSchema = z.object({
    code: z.string().min(1).max(32_000),
    timeoutMs: z.number().int().min(1_000).max(60_000).optional(),
});


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


const configureGatewayServer = (server: McpServer, policy: GatewayPolicyContext) => {
    server.server.registerCapabilities({ tools: {} });

    server.server.setRequestHandler(ListToolsRequestSchema, async () => {
        await ensureFreshProviderTools(policy);
        const permittedTools = listPermittedTools(policy);

        const tools: Tool[] = permittedTools.map((tool) => ({
            name: tool.classicName,
            description: tool.description,
            title: tool.title ?? undefined,
            inputSchema: {
                type: "object",
                ...tool.inputSchema,
            },
            annotations: {
                readOnlyHint: tool.readOnly,
                destructiveHint: tool.destructive,
            },
        }));

        if (permittedTools.length > 0) {
            tools.push({
                name: EXECUTE_TOOL_NAME,
                title: "Execute JavaScript in Sandbox",
                description: [
                    "Run an async JavaScript snippet inside an isolated QuickJS WASM sandbox with access to all permitted tools.",
                    "Ideal for batching calls with Promise.all(), filtering large payloads (e.g. hundreds of Steam games), or cross-referencing data across providers.",
                    "Call any permitted tool `<provider>__<tool>` via `await tools.<provider>.<tool>(args)` or `await callTool('provider.tool', args)`, and `return` the final JSON summary.",
                    "Supports console.log(). No network, filesystem, or host globals exist.",
                ].join(" "),
                inputSchema: {
                    type: "object" as const,
                    required: ["code"],
                    properties: {
                        code: {
                            type: "string",
                            minLength: 1,
                            maxLength: 32_000,
                            description: "Async JS function body. Use `await tools.<provider>.<tool>(args)` and `return <result>`.",
                        },
                        timeoutMs: {
                            type: "integer",
                            minimum: 1_000,
                            maximum: 60_000,
                            description: "Wall-clock timeout in ms (default 45000, max 60000).",
                        },
                    },
                },
                annotations: {
                    readOnlyHint: policy.readOnly,
                    destructiveHint: false,
                },
            });
        }

        return { tools };
    });

    server.server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
        const toolName = req.params.name;
        const args = (req.params.arguments ?? {}) as Record<string, unknown>;

        if (toolName === EXECUTE_TOOL_NAME) {
            try {
                const parsed = executeArgsSchema.parse(args);
                const result = await executeSandboxScript(policy, parsed);
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
        }

        try {
            const response = await invokePermittedTool(policy, toolName, args, {
                signal: extra.signal,
            });
            return {
                content: response.content,
                isError: response.isError,
                ...(response.structuredContent !== undefined ? { structuredContent: response.structuredContent } : {}),
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
    const instructions = "Relay Personal MCP Gateway. Call permitted upstream and built-in tools directly, " +
        "or use `execute` to batch, filter, or cross-reference tool responses inside QuickJS.";

    const server = new McpServer({ name: "Relay", version: "0.1.0" }, { instructions });
    configureGatewayServer(server, policy);

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
