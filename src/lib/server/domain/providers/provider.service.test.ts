import {eq} from "drizzle-orm";
import {db} from "@/lib/server/database/db";
import {executionLog} from "@/lib/server/database/schema";
import {afterAll, describe, expect, test} from "bun:test";
import {
    createProvider,
    deleteProvider,
    describePermittedTools,
    executeCodeModeScript,
    invokePermittedTool,
    searchPermittedTools,
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
});
