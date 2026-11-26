import {clientEnv} from "@/env/client";


export const MCP_ACCESS_SCOPE = "relay:access";

export const MCP_SCOPES = [MCP_ACCESS_SCOPE, "offline_access"];

export const MCP_RESOURCE = new URL("/api/mcp", clientEnv.VITE_BASE_URL).href;
