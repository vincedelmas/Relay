interface BuiltInToolDefinition {
    name: string;
    title: string;
    readOnly?: boolean;
    description: string;
    destructive?: boolean;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    execute: (args: Record<string, unknown>, context: { config: Record<string, string>; signal: AbortSignal }) => Promise<unknown>;
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
