import {describe, expect, test} from "bun:test";
import {assignUniqueJsNames, toJsIdentifier, toProviderSlug} from "./identifiers";


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
