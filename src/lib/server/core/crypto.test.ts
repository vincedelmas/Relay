import {describe, expect, test} from "bun:test";
import {decryptJson, decryptSecret, encryptJson, encryptSecret} from "./crypto";


describe("crypto", () => {
    test("round-trips secrets with fresh random IVs", async () => {
        const a = await encryptSecret("top-secret-token");
        const b = await encryptSecret("top-secret-token");

        expect(a).not.toBe(b);
        expect(a.startsWith("v1:")).toBe(true);
        expect(await decryptSecret(a)).toBe("top-secret-token");
        expect(await decryptSecret(b)).toBe("top-secret-token");
    });

    test("round-trips structured JSON", async () => {
        const encrypted = await encryptJson({ access_token: "abc", expires_in: 3600 });
        expect(await decryptJson<{ access_token: string; expires_in: number }>(encrypted)).toEqual({
            access_token: "abc",
            expires_in: 3600,
        });
    });

    test("rejects tampered ciphertext", async () => {
        const encrypted = await encryptSecret("sensitive");
        const [v, iv, data] = encrypted.split(":");
        const tampered = `${v}:${iv}:${data.slice(0, -2)}AA`;
        await expect(decryptSecret(tampered)).rejects.toThrow();
    });
});
