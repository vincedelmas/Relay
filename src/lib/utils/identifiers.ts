const JS_RESERVED_WORDS = new Set([
    "await", "break", "case", "catch", "class", "const", "continue", "debugger",
    "default", "delete", "do", "else", "enum", "export", "extends", "false",
    "finally", "for", "function", "if", "implements", "import", "in", "instanceof",
    "interface", "let", "new", "null", "package", "private", "protected", "public",
    "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof",
    "var", "void", "while", "with", "yield", "arguments", "eval", "prototype",
    "constructor", "__proto__", "toString", "valueOf",
]);


export const toJsIdentifier = (raw: string, fallback = "tool"): string => {
    let cleaned = raw
        .trim()
        .replace(/[^a-zA-Z0-9_$]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    if (!cleaned) cleaned = fallback;
    if (/^[0-9]/.test(cleaned)) cleaned = `_${cleaned}`;
    if (JS_RESERVED_WORDS.has(cleaned)) cleaned = `${cleaned}_`;

    return cleaned;
};


export const toProviderSlug = (raw: string): string => {
    return toJsIdentifier(raw.toLowerCase(), "provider").toLowerCase();
};


export const assignUniqueJsNames = <T extends { name: string }>(items: readonly T[]): Array<T & { jsName: string }> => {
    const used = new Set<string>();

    return items.map((item) => {
        const base = toJsIdentifier(item.name);
        let candidate = base;
        let suffix = 2;

        while (used.has(candidate)) {
            candidate = `${base}_${suffix}`;
            suffix += 1;
        }

        used.add(candidate);
        return { ...item, jsName: candidate };
    });
};
