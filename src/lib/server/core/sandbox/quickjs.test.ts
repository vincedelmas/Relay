import {describe, expect, test} from "bun:test";
import {runQuickJsSandbox} from "./quickjs";


describe("QuickJS Code Mode sandbox", () => {
    test("runs async scripts with Promise.all, tools namespaces, and console capture", async () => {
        const res = await runQuickJsSandbox({
            toolManifest: {
                steam: ["get_profile", "get_owned_games"],
            },
            callTool: async (provider, tool, args) => {
                if (provider === "steam" && tool === "get_profile") {
                    return { personaName: "Vince" };
                }
                if (provider === "steam" && tool === "get_owned_games") {
                    return { games: [{ name: "Hades", hours: 120 }, { name: "Balatro", hours: Number(args.minHours ?? 10) }] };
                }
                throw new Error(`Unknown tool ${provider}.${tool}`);
            },
            code: `
                console.log("namespaces:", Object.keys(tools));
                const [profile, library] = await Promise.all([
                    tools.steam.get_profile(),
                    tools.steam.get_owned_games({ minHours: 42 }),
                ]);
                return { user: profile.personaName, total: library.games.length, secondHours: library.games[1].hours };
            `,
        });

        expect(res.result).toEqual({ user: "Vince", total: 2, secondHours: 42 });
        expect(res.toolCallCount).toBe(2);
        expect(res.logs).toEqual(['namespaces: ["steam"]']);
    });

    test("isolates host globals (no fetch, process, Bun, require)", async () => {
        const res = await runQuickJsSandbox({
            toolManifest: {},
            callTool: async () => null,
            code: `
                return {
                    hasFetch: typeof fetch !== "undefined",
                    hasProcess: typeof process !== "undefined",
                    hasBun: typeof Bun !== "undefined",
                    hasRequire: typeof require !== "undefined",
                    hasBridge: typeof __relayCallTool !== "undefined",
                };
            `,
        });

        expect(res.result).toEqual({
            hasFetch: false,
            hasProcess: false,
            hasBun: false,
            hasRequire: false,
            hasBridge: false,
        });
    });

    test("interrupts synchronous infinite loops via CPU timeout", async () => {
        await expect(runQuickJsSandbox({
            toolManifest: {},
            callTool: async () => null,
            limits: { cpuTimeoutMs: 120, wallTimeoutMs: 2_000 },
            code: "while (true) {}",
        })).rejects.toThrow(/CPU time limit|interrupted/i);
    });

    test("enforces memory cap on runaway allocations", async () => {
        await expect(runQuickJsSandbox({
            toolManifest: {},
            callTool: async () => null,
            limits: { memoryLimitBytes: 2 * 1024 * 1024 },
            code: `
                const items = [];
                for (let i = 0; i < 100000; i++) items.push({ i, label: "item-" + i });
                return items.length;
            `,
        })).rejects.toThrow(/out of memory/i);
    });

    test("enforces maxToolCalls limit and oversized response payload limit", async () => {
        await expect(runQuickJsSandbox({
            toolManifest: { demo: ["ping"] },
            callTool: async () => ({ ok: true }),
            limits: { maxToolCalls: 2 },
            code: `
                await tools.demo.ping();
                await tools.demo.ping();
                return await tools.demo.ping();
            `,
        })).rejects.toThrow(/maximum tool call limit/i);

        await expect(runQuickJsSandbox({
            toolManifest: { demo: ["huge"] },
            callTool: async () => ({ blob: "a".repeat(20_000) }),
            limits: { maxToolResponseBytes: 4_096 },
            code: "return await tools.demo.huge();",
        })).rejects.toThrow(/exceeded sandbox limit/i);
    });

    test("enforces wall-clock timeout while awaiting hung upstream tool", async () => {
        await expect(runQuickJsSandbox({
            toolManifest: { slow: ["hang"] },
            callTool: async (_p, _t, _a, signal) => {
                await new Promise<void>((_, reject) => {
                    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
                });
            },
            limits: { wallTimeoutMs: 1_000 },
            code: "return await tools.slow.hang();",
        })).rejects.toThrow(/wall-clock timeout/i);
    });
});
