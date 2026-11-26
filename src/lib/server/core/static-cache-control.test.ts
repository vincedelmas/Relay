import {describe, expect, it} from "vitest";
import {getStaticCacheControl} from "./static-cache-control";


describe("getStaticCacheControl", () => {
    it("marks fingerprinted vite assets immutable", () => {
        expect(getStaticCacheControl("/assets/index-Ab12Cd34.js")).toBe("public, max-age=31536000, immutable");
    });

    it("disables long-term caching for unversioned files", () => {
        expect(getStaticCacheControl("/favicon.svg")).toBe("no-cache");
    });
});
