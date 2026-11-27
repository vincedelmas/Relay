import net from "node:net";
import https from "node:https";
import dns from "node:dns/promises";
import type {ClientMetadataResourceFetch} from "@better-auth/oauth-provider";


const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;


const isPrivateIpv4 = (ip: string): boolean => {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;

    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 169 && b === 254) return true; // Link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true; // Multicast & reserved
    return false;
};


const isSpecialUseIp = (address: string): boolean => {
    const family = net.isIP(address);
    if (family === 4) return isPrivateIpv4(address);
    if (family !== 6) return true;

    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;

    if (lower.startsWith("::ffff:")) {
        const mapped = lower.slice("::ffff:".length);
        if (net.isIP(mapped) === 4) return isPrivateIpv4(mapped);
        return true;
    }

    const firstHextet = Number.parseInt(lower.split(":")[0] || "0", 16);
    if (Number.isNaN(firstHextet)) return true;
    if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((firstHextet & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (lower.startsWith("2001:db8:") || lower.startsWith("2001:0db8:")) return true; // documentation
    if (lower.startsWith("64:ff9b:") || lower.startsWith("100::")) return true; // NAT64 / discard
    return false;
};


/**
 * SSRF-hardened HTTPS transport for Better Auth CIMD metadata fetches:
 * resolves DNS once, rejects RFC 6890 special-use IPs, pins the resolved IP
 * on the TLS socket (with original SNI), refuses redirects, and caps size/time.
 */
export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl);

    if (url.protocol !== "https:") {
        throw new Error("CIMD metadata resources must use HTTPS");
    }

    const records = await dns.lookup(url.hostname, { all: true, order: "verbatim" });
    if (records.length === 0) {
        throw new Error("DNS resolution returned no addresses");
    }

    const pinned = records.find((record) => !isSpecialUseIp(record.address));
    if (!pinned || records.some((record) => isSpecialUseIp(record.address))) {
        throw new Error("CIMD metadata host resolved to a disallowed IP address");
    }

    const headers: Record<string, string> = {};
    if (init?.headers) {
        new Headers(init.headers).forEach((value, key) => {
            headers[key] = value;
        });
    }
    headers.host = url.host;

    return new Promise<Response>((resolve, reject) => {
        const req = https.request({
            host: pinned.address,
            port: url.port ? Number(url.port) : 443,
            path: `${url.pathname}${url.search}`,
            method: init?.method ?? "GET",
            servername: url.hostname,
            headers,
            timeout: REQUEST_TIMEOUT_MS,
            family: pinned.family,
        }, (res) => {
            const status = res.statusCode ?? 500;
            if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
                res.destroy();
                reject(new Error("Redirects are not allowed for CIMD metadata resources"));
                return;
            }

            const chunks: Buffer[] = [];
            let totalBytes = 0;

            res.on("data", (chunk: Buffer) => {
                totalBytes += chunk.length;
                if (totalBytes > MAX_RESPONSE_BYTES) {
                    res.destroy();
                    reject(new Error("CIMD metadata response exceeded maximum allowed size"));
                    return;
                }
                chunks.push(chunk);
            });

            res.on("end", () => {
                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (Array.isArray(value)) {
                        for (const item of value) responseHeaders.append(key, item);
                    }
                    else if (typeof value === "string") {
                        responseHeaders.set(key, value);
                    }
                }
                const body = status === 204 || status === 304 ? null : Buffer.concat(chunks);
                resolve(new Response(body, { status, headers: responseHeaders }));
            });

            res.on("error", reject);
        });

        req.on("timeout", () => {
            req.destroy(new Error("CIMD metadata request timed out"));
        });
        req.on("error", reject);

        if (init?.signal) {
            if (init.signal.aborted) {
                req.destroy(new Error("CIMD metadata request aborted"));
                return;
            }
            init.signal.addEventListener("abort", () => req.destroy(new Error("CIMD metadata request aborted")), { once: true });
        }

        req.end();
    });
};
