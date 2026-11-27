import {serverEnv} from "@/env/server";


const IV_BYTES = 12;
const VERSION_PREFIX = "v1";

let cachedKeyPromise: Promise<CryptoKey> | null = null;


const getAesKey = (): Promise<CryptoKey> => {
    if (!cachedKeyPromise) {
        cachedKeyPromise = (async () => {
            const material = new TextEncoder().encode(serverEnv.RELAY_ENCRYPTION_KEY);
            const digest = await crypto.subtle.digest("SHA-256", material);
            return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        })();
    }

    return cachedKeyPromise;
};


export const encryptSecret = async (plaintext: string): Promise<string> => {
    const key = await getAesKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

    return `${VERSION_PREFIX}:${Buffer.from(iv).toString("base64url")}:${Buffer.from(ciphertext).toString("base64url")}`;
};


export const decryptSecret = async (payload: string): Promise<string> => {
    const [version, ivB64, dataB64] = payload.split(":");
    if (version !== VERSION_PREFIX || !ivB64 || !dataB64) {
        throw new Error("Invalid encrypted payload format");
    }

    const key = await getAesKey();
    const iv = Buffer.from(ivB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);

    return new TextDecoder().decode(plaintext);
};


export const encryptJson = async <T>(value: T): Promise<string> => {
    return encryptSecret(JSON.stringify(value));
};


export const decryptJson = async <T>(payload: string): Promise<T> => {
    return JSON.parse(await decryptSecret(payload)) as T;
};
