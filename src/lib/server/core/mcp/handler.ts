import {auth} from "@/lib/server/core/auth";
import {requireMcpAuth} from "@better-auth/mcp";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {MCP_ACCESS_SCOPE, MCP_RESOURCE, MCP_SCOPES} from "@/lib/server/core/mcp/config";
import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";


export const handleMcpRequest = requireMcpAuth(auth, async (request) => {
    const server = new McpServer({ name: "Relay", version: "0.1.0" }, {
        instructions: "Personal MCP Gateway.",
    });

    server.registerTool("relay_ping", {
        title: "Relay Ping",
        description: "Verify connectivity to the Relay MCP Gateway.",
        annotations: { readOnlyHint: true },
    }, async () => ({
        content: [{ type: "text", text: "pong" }],
    }));

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
