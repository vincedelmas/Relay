import type {getGatewayState} from "@/lib/server/functions/gateway";
import type {CallToolResult} from "@modelcontextprotocol/sdk/types.js";


export type ProviderKind = "remote_mcp" | "builtin";
export type ProviderAuthType = "none" | "oauth" | "bearer";


type GatewayState = Awaited<ReturnType<typeof getGatewayState>>;
export type GatewayLog = GatewayState["logs"][number];
export type GatewayClient = GatewayState["clients"][number];
export type GatewayBuiltIn = GatewayState["builtins"][number];
export type GatewayProvider = GatewayState["providers"][number];


export interface ProviderPreset {
    label: string;
    name: string;
    slug: string;
    url?: string;
    kind: ProviderKind;
    builtinKey?: string;
    authType?: ProviderAuthType;
}


interface BuiltInToolDefinition {
    name: string;
    title: string;
    readOnly?: boolean;
    description: string;
    destructive?: boolean;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    execute: (
        args: Record<string, unknown>,
        context: { config: Record<string, string>; signal: AbortSignal },
    ) => Promise<unknown>;
}


interface BuiltInConfigField {
    key: string;
    label: string;
    secret?: boolean;
    placeholder: string;
    envFallback?: string;
}


export interface BuiltInProviderDefinition {
    key: string;
    defaultSlug: string;
    defaultName: string;
    description: string;
    tools: BuiltInToolDefinition[];
    configFields: BuiltInConfigField[];
}


export interface RemoteProviderDescriptor {
    id: string;
    url: string;
    name: string;
    authType: ProviderAuthType;
    encryptedAuthSecret: string | null;
}


export interface UpstreamToolInfo {
    name: string;
    title?: string;
    readOnly: boolean;
    description: string;
    destructive: boolean;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
}


export interface GatewayPolicyContext {
    readOnly: boolean;
    clientId?: string | null;
    clientName?: string | null;
    /** Null means admin/playground bypass (all enabled providers allowed). */
    allowedProviderIds: string[] | null;
}


export interface InvokedToolResponse {
    data: unknown;
    content: CallToolResult["content"];
    structuredContent?: Record<string, unknown>;
    isError: boolean;
}


export interface McpClientAccess {
    userId: string;
    clientId: string;
    clientName: string;
    readOnly: boolean;
    allowedProviderIds: string[];
}


export interface RecordExecutionLogInput {
    clientId?: string | null;
    clientName?: string | null;
    kind: "call" | "execute";
    providerSlug?: string | null;
    toolName?: string | null;
    code?: string | null;
    toolCallCount: number;
    status: "ok" | "error";
    errorMessage?: string | null;
    durationMs: number;
}


export interface QuickJsSandboxLimits {
    memoryLimitBytes?: number;
    maxStackSizeBytes?: number;
    cpuTimeoutMs?: number;
    wallTimeoutMs?: number;
    maxToolCalls?: number;
    maxToolResponseBytes?: number;
    maxResultBytes?: number;
    maxLogsBytes?: number;
}


export interface QuickJsSandboxOptions {
    code: string;
    toolManifest: Record<string, string[]>;
    callTool: (providerSlug: string, jsName: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
    limits?: QuickJsSandboxLimits;
}


export interface QuickJsSandboxResult {
    result: unknown;
    logs: string[];
    toolCallCount: number;
    durationMs: number;
}
