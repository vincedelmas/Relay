import {eq, sql} from "drizzle-orm";
import {db} from "@/lib/server/database/db";
import {executionLog, provider, providerTool} from "@/lib/server/database/schema";
import {afterAll, describe, expect, test} from "bun:test";
import {
    createProvider,
    deleteProvider,
    describePermittedTools,
    executeCodeModeScript,
    invokePermittedTool,
    searchPermittedTools,
    updateProvider,
} from "./provider.service";


const createdProviderIds: string[] = [];

afterAll(() => {
    for (const id of createdProviderIds) {
        deleteProvider(id);
    }
    db.delete(executionLog).where(eq(executionLog.clientName, "unit-test")).run();
});


describe("ProviderService policy + FTS5", () => {
    test("indexes built-in Steam tools in FTS5 and enforces client allowlist", async () => {
        const slug = `steam_test_${Date.now()}`;
        const { id } = await createProvider({
            name: "Steam Test",
            slug,
            kind: "builtin",
            builtinKey: "steam",
        });
        createdProviderIds.push(id);

        // Allowed client finds tools via BM25 search & describes them with TS signatures
        const searchAllowed = searchPermittedTools(
            { allowedProviderIds: [id], readOnly: true },
            { query: "achievements playtime" },
        );
        expect(searchAllowed.tools.length).toBeGreaterThanOrEqual(2);
        expect(searchAllowed.tools.every((t) => t.providerSlug === slug)).toBe(true);

        const described = describePermittedTools(
            { allowedProviderIds: [id], readOnly: true },
            [`${slug}.get_owned_games`],
        );
        expect(described.tools).toHaveLength(1);
        expect(described.tools[0].signature).toContain(`tools.${slug}.get_owned_games(`);

        // Disallowed client sees ZERO tools on discovery AND is blocked on execution
        const searchDenied = searchPermittedTools(
            { allowedProviderIds: [], readOnly: false },
            { query: "steam" },
        );
        expect(searchDenied.tools).toHaveLength(0);

        await expect(invokePermittedTool(
            { allowedProviderIds: [], readOnly: false },
            `${slug}.get_profile`,
            {},
            { logExecution: false },
        )).rejects.toThrow(/not permitted/i);

        // Code Mode sandbox exposes only permitted namespaces
        const execResult = await executeCodeModeScript(
            { allowedProviderIds: [id], readOnly: true, clientName: "unit-test" },
            { code: `return Object.keys(tools.${slug}).sort();` },
        );
        expect(execResult.result).toEqual([
            "get_app_details",
            "get_game_achievements",
            "get_owned_games",
            "get_profile",
            "get_recently_played",
            "search_store",
        ]);
    });

    test("filters FTS5 matches by allowlist before LIMIT and clears state on URL change", async () => {
        const suffix = Date.now();
        const disallowed = await createProvider({
            name: "Noisy Remote",
            slug: `noisy_${suffix}`,
            kind: "remote_mcp",
            url: "https://noisy.example/mcp",
            authType: "oauth",
        });
        const allowed = await createProvider({
            name: "Allowed Remote",
            slug: `allowed_${suffix}`,
            kind: "remote_mcp",
            url: "https://allowed.example/mcp",
            authType: "bearer",
            authSecret: "secret-token-for-old-host",
        });
        createdProviderIds.push(disallowed.id, allowed.id);

        const now = new Date();
        // Insert 10 disallowed tools with strong keyword matches + 1 permitted tool
        for (let i = 0; i < 10; i++) {
            const toolId = `${disallowed.id}:widget_tool_${i}`;
            db.insert(providerTool).values({
                id: toolId,
                providerId: disallowed.id,
                name: `widget_tool_${i}`,
                jsName: `widget_tool_${i}`,
                description: "widget widget widget",
                inputSchema: { type: "object", properties: {} },
                readOnly: true,
                destructive: false,
                enabled: true,
                updatedAt: now,
            }).run();
            db.run(sql`
                INSERT INTO provider_tool_fts (tool_id, provider_slug, name, js_name, title, description, schema_keys)
                VALUES (${toolId}, ${disallowed.slug}, ${`widget_tool_${i}`}, ${`widget_tool_${i}`}, "", "widget widget widget", "")
            `);
        }

        const permittedToolId = `${allowed.id}:find_widget`;
        db.insert(providerTool).values({
            id: permittedToolId,
            providerId: allowed.id,
            name: "find_widget",
            jsName: "find_widget",
            description: "Find a single widget",
            inputSchema: { type: "object", properties: {} },
            readOnly: true,
            destructive: false,
            enabled: true,
            updatedAt: now,
        }).run();
        db.run(sql`
            INSERT INTO provider_tool_fts (tool_id, provider_slug, name, js_name, title, description, schema_keys)
            VALUES (${permittedToolId}, ${allowed.slug}, "find_widget", "find_widget", "", "Find a single widget", "")
        `);

        const search = searchPermittedTools(
            { allowedProviderIds: [allowed.id], readOnly: true },
            { query: "widget", limit: 1 },
        );
        expect(search.tools).toHaveLength(1);
        expect(search.tools[0].id).toBe(`${allowed.slug}.find_widget`);

        // Changing the endpoint URL must clear stored bearer token and cached tools
        await updateProvider({
            id: allowed.id,
            url: "https://replacement.example/mcp",
        });

        const updatedRow = db.select().from(provider).where(eq(provider.id, allowed.id)).get();
        expect(updatedRow?.encryptedAuthSecret).toBeNull();
        expect(db.select().from(providerTool).where(eq(providerTool.providerId, allowed.id)).all()).toHaveLength(0);
        expect(searchPermittedTools({ allowedProviderIds: [allowed.id], readOnly: false }, { query: "widget" }).tools).toHaveLength(0);
    });
});
