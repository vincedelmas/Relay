import {eq} from "drizzle-orm";
import {db} from "@/lib/server/database/db";
import {decryptJson} from "@/lib/server/core/crypto";
import {afterAll, describe, expect, test} from "bun:test";
import {executionLog, provider, providerTool} from "@/lib/server/database/schema";
import {
    createProvider,
    deleteProvider,
    executeSandboxScript,
    invokePermittedTool,
    listPermittedTools,
    updateProvider,
} from "./provider.service";


const createdProviderIds: string[] = [];

afterAll(() => {
    for (const id of createdProviderIds) {
        deleteProvider(id);
    }
    db.delete(executionLog).where(eq(executionLog.clientName, "unit-test")).run();
});


describe("ProviderService policy + sandbox", () => {
    test("exposes built-in Steam tool and enforces client allowlist", async () => {
        const slug = `steam_test_${Date.now()}`;
        const { id } = await createProvider({
            name: "Steam Test",
            slug,
            kind: "builtin",
            builtinKey: "steam",
        });
        createdProviderIds.push(id);

        // Allowed client sees the Steam request tool directly
        const allowedTools = listPermittedTools({ allowedProviderIds: [id], readOnly: true });
        expect(allowedTools).toHaveLength(1);
        expect(allowedTools[0].classicName).toBe(`${slug}__request`);

        // Disallowed client sees ZERO tools and is blocked on execution
        expect(listPermittedTools({ allowedProviderIds: [], readOnly: false })).toHaveLength(0);

        await expect(invokePermittedTool(
            { allowedProviderIds: [], readOnly: false },
            `${slug}__request`,
            { path: "ISteamUser/GetPlayerSummaries/v2/" },
            { logExecution: false },
        )).rejects.toThrow(/not permitted/i);

        // QuickJS sandbox exposes only permitted namespaces
        const execResult = await executeSandboxScript(
            { allowedProviderIds: [id], readOnly: true, clientName: "unit-test" },
            { code: `return Object.keys(tools.${slug});` },
        );
        expect(execResult.result).toEqual(["request"]);

        // Steam path traversal / full URL injection is rejected
        await expect(invokePermittedTool(
            { allowedProviderIds: [id], readOnly: true },
            `${slug}__request`,
            { api: "webapi", path: "https://evil.example/steal" },
            { logExecution: false },
        )).rejects.toThrow(/relative endpoint path/i);
    });

    test("clears stored credentials and cached tools when a remote URL changes", async () => {
        const suffix = Date.now();
        const remote = await createProvider({
            name: "Remote Test",
            slug: `remote_${suffix}`,
            kind: "remote_mcp",
            url: "https://old-host.example/mcp",
            authType: "bearer",
            authSecret: "secret-token-for-old-host",
        });
        createdProviderIds.push(remote.id);

        db.insert(providerTool).values({
            id: `${remote.id}:sample_tool`,
            providerId: remote.id,
            name: "sample_tool",
            jsName: "sample_tool",
            description: "Sample tool",
            inputSchema: { type: "object", properties: {} },
            readOnly: true,
            destructive: false,
            enabled: true,
            updatedAt: new Date(),
        }).run();

        await updateProvider({
            id: remote.id,
            url: "https://new-host.example/mcp",
        });

        const updatedRow = db.select().from(provider).where(eq(provider.id, remote.id)).get();
        expect(updatedRow?.encryptedAuthSecret).toBeNull();
        expect(db.select().from(providerTool).where(eq(providerTool.providerId, remote.id)).all()).toHaveLength(0);
    });

    test("resolves reserved-word provider slugs ending in '_' and merges partial builtin config edits", async () => {
        const created = await createProvider({
            name: "Default",
            slug: "default",
            kind: "builtin",
            builtinKey: "steam",
            config: { apiKey: "initial-steam-key", steamId: "76561198000000001" },
        });
        createdProviderIds.push(created.id);
        expect(created.slug).toBe("default_");

        // Trailing `_` in provider slug produces `___` in classicName; resolver must still match it
        const tools = listPermittedTools({ allowedProviderIds: [created.id], readOnly: true });
        expect(tools).toHaveLength(1);
        expect(tools[0].classicName).toBe(`${created.slug}__request`);

        await expect(invokePermittedTool(
            { allowedProviderIds: [created.id], readOnly: true },
            tools[0].classicName,
            { api: "webapi", path: "https://evil.example/x" },
            { logExecution: false },
        )).rejects.toThrow(/relative endpoint path/i);

        // Updating only steamId must preserve apiKey
        await updateProvider({
            id: created.id,
            config: { steamId: "76561198000000002", apiKey: "" },
        });

        const updatedRow = db.select().from(provider).where(eq(provider.id, created.id)).get();
        expect(updatedRow?.encryptedConfig).toBeTruthy();
        const decrypted = await decryptJson<Record<string, string>>(updatedRow!.encryptedConfig!);
        expect(decrypted).toEqual({
            apiKey: "initial-steam-key",
            steamId: "76561198000000002",
        });
    });
});
