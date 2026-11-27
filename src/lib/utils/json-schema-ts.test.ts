import {describe, expect, test} from "bun:test";
import {assignUniqueJsNames, toJsIdentifier, toProviderSlug} from "./identifiers";
import {extractSchemaSearchTerms, jsonSchemaToTypeScript, renderToolSignature} from "./json-schema-ts";


describe("identifiers", () => {
    test("sanitizes dashed, numeric, and reserved names", () => {
        expect(toJsIdentifier("search-recipes")).toBe("search_recipes");
        expect(toJsIdentifier("123-run")).toBe("_123_run");
        expect(toJsIdentifier("delete")).toBe("delete_");
        expect(toProviderSlug("My-Lists!!")).toBe("my_lists");
    });

    test("disambiguates colliding sanitized names deterministically", () => {
        const result = assignUniqueJsNames([
            { name: "get-user" },
            { name: "get_user" },
            { name: "get user" },
        ]);
        expect(result.map((r) => r.jsName)).toEqual(["get_user", "get_user_2", "get_user_3"]);
    });
});


describe("jsonSchemaToTypeScript", () => {
    test("renders nested objects, unions, arrays, and JSDoc annotations", () => {
        const sig = renderToolSignature({
            providerSlug: "steam",
            jsName: "get_owned_games",
            description: "List owned Steam games with playtime.",
            readOnly: true,
            inputSchema: {
                type: "object",
                required: ["steamId"],
                properties: {
                    steamId: { type: "string", description: "64-bit Steam ID" },
                    limit: { type: "integer" },
                    sort: { enum: ["playtime", "name"] },
                    tags: { type: "array", items: { type: "string" } },
                    filter: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
            },
        });

        expect(sig).toContain("@readonly");
        expect(sig).toContain("tools.steam.get_owned_games(args: {");
        expect(sig).toContain("/** 64-bit Steam ID */");
        expect(sig).toContain("steamId: string;");
        expect(sig).toContain("limit?: number;");
        expect(sig).toContain('sort?: "playtime" | "name";');
        expect(sig).toContain("tags?: string[];");
        expect(sig).toContain("filter?: string | null;");
    });

    test("renders empty-arg signature cleanly", () => {
        const sig = renderToolSignature({
            providerSlug: "mylists",
            jsName: "whoami",
            inputSchema: { type: "object", properties: {} },
        });
        expect(sig).toBe("tools.mylists.whoami(): Promise<unknown>;");
    });

    test("handles additionalProperties and extracts search terms", () => {
        const ts = jsonSchemaToTypeScript({
            type: "object",
            additionalProperties: { type: "number" },
        });
        expect(ts).toBe("Record<string, number>");

        const terms = extractSchemaSearchTerms({
            type: "object",
            properties: {
                appId: { type: "number", description: "Steam application identifier" },
            },
        });
        expect(terms).toContain("appId");
        expect(terms).toContain("Steam application identifier");
    });
});
