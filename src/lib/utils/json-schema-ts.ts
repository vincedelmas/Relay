type JsonSchema = Record<string, unknown>;


const MAX_DEPTH = 6;


const formatPropertyKey = (key: string): string => {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
};


const renderSchemaNode = (schema: unknown, depth: number): string => {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return "unknown";
    if (depth > MAX_DEPTH) return "unknown";

    const s = schema as JsonSchema;

    if ("const" in s) {
        return JSON.stringify(s.const);
    }

    if (Array.isArray(s.enum) && s.enum.length > 0) {
        return s.enum.map((v) => JSON.stringify(v)).join(" | ");
    }

    if (Array.isArray(s.anyOf) && s.anyOf.length > 0) {
        return s.anyOf.map((branch) => renderSchemaNode(branch, depth + 1)).join(" | ");
    }

    if (Array.isArray(s.oneOf) && s.oneOf.length > 0) {
        return s.oneOf.map((branch) => renderSchemaNode(branch, depth + 1)).join(" | ");
    }

    if (Array.isArray(s.allOf) && s.allOf.length > 0) {
        return s.allOf.map((branch) => renderSchemaNode(branch, depth + 1)).join(" & ");
    }

    if (Array.isArray(s.type)) {
        return s.type.map((t) => renderSchemaNode({ ...s, type: t }, depth + 1)).join(" | ");
    }

    const type = typeof s.type === "string" ? s.type : undefined;

    if (type === "string") return "string";
    if (type === "number" || type === "integer") return "number";
    if (type === "boolean") return "boolean";
    if (type === "null") return "null";

    if (type === "array" || "items" in s) {
        if (Array.isArray(s.items)) {
            return `[${s.items.map((item) => renderSchemaNode(item, depth + 1)).join(", ")}]`;
        }
        const itemType = s.items ? renderSchemaNode(s.items, depth + 1) : "unknown";
        const needsParens = itemType.includes(" | ") || itemType.includes(" & ");
        return needsParens ? `(${itemType})[]` : `${itemType}[]`;
    }

    if (type === "object" || (s.properties && typeof s.properties === "object")) {
        const properties = (s.properties && typeof s.properties === "object" && !Array.isArray(s.properties))
            ? (s.properties as Record<string, unknown>)
            : null;
        const required = new Set(Array.isArray(s.required) ? s.required.filter((r): r is string => typeof r === "string") : []);
        const entries = properties ? Object.entries(properties) : [];

        if (entries.length === 0) {
            if (s.additionalProperties && typeof s.additionalProperties === "object") {
                return `Record<string, ${renderSchemaNode(s.additionalProperties, depth + 1)}>`;
            }
            return "Record<string, unknown>";
        }

        const indent = "  ".repeat(depth + 1);
        const closeIndent = "  ".repeat(depth);
        const lines = entries.map(([key, propSchema]) => {
            const propObj = (propSchema && typeof propSchema === "object" && !Array.isArray(propSchema))
                ? (propSchema as JsonSchema)
                : null;
            const desc = typeof propObj?.description === "string"
                ? propObj.description.replace(/\s+/g, " ").trim()
                : "";
            const comment = desc ? `${indent}/** ${desc} */\n` : "";
            const opt = required.has(key) ? "" : "?";
            return `${comment}${indent}${formatPropertyKey(key)}${opt}: ${renderSchemaNode(propSchema, depth + 1)};`;
        });

        if (s.additionalProperties && typeof s.additionalProperties === "object") {
            lines.push(`${indent}[key: string]: ${renderSchemaNode(s.additionalProperties, depth + 1)};`);
        }

        return `{\n${lines.join("\n")}\n${closeIndent}}`;
    }

    return "unknown";
};


export const jsonSchemaToTypeScript = (schema: Record<string, unknown> | null | undefined): string => {
    if (!schema) return "Record<string, unknown>";
    return renderSchemaNode(schema, 0);
};


export const renderToolSignature = (input: {
    providerSlug: string;
    jsName: string;
    description?: string | null;
    inputSchema?: Record<string, unknown> | null;
    outputSchema?: Record<string, unknown> | null;
    readOnly?: boolean;
    destructive?: boolean;
}): string => {
    const props = input.inputSchema?.properties;
    const hasArgs = !!(props && typeof props === "object" && Object.keys(props).length > 0);
    const required = Array.isArray(input.inputSchema?.required) ? input.inputSchema.required : [];
    const argsType = hasArgs ? jsonSchemaToTypeScript(input.inputSchema) : undefined;
    const returnType = input.outputSchema ? jsonSchemaToTypeScript(input.outputSchema) : "unknown";

    const tags: string[] = [];
    if (input.readOnly) tags.push("@readonly");
    if (input.destructive) tags.push("@destructive");

    const docLines: string[] = [];
    if (input.description?.trim()) {
        docLines.push(` * ${input.description.replace(/\s+/g, " ").trim()}`);
    }
    if (tags.length > 0) {
        docLines.push(` * ${tags.join(" ")}`);
    }

    const jsDoc = docLines.length > 0 ? `/**\n${docLines.join("\n")}\n */\n` : "";
    const param = argsType
        ? `args${required.length === 0 ? "?" : ""}: ${argsType}`
        : "";

    return `${jsDoc}tools.${input.providerSlug}.${input.jsName}(${param}): Promise<${returnType}>;`;
};


export const extractSchemaSearchTerms = (schema: Record<string, unknown> | null | undefined): string => {
    if (!schema || typeof schema !== "object") return "";
    const terms: string[] = [];

    const visit = (node: unknown, depth: number) => {
        if (!node || typeof node !== "object" || depth > 3) return;
        const obj = node as JsonSchema;
        if (obj.properties && typeof obj.properties === "object" && !Array.isArray(obj.properties)) {
            for (const [key, value] of Object.entries(obj.properties as Record<string, unknown>)) {
                terms.push(key);
                if (value && typeof value === "object" && !Array.isArray(value)) {
                    const desc = (value as JsonSchema).description;
                    if (typeof desc === "string") terms.push(desc);
                    visit(value, depth + 1);
                }
            }
        }
    };

    visit(schema, 0);
    return terms.join(" ").slice(0, 2000);
};
