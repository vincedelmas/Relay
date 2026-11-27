import {serverEnv} from "@/env/server";
import type {BuiltInProviderDefinition} from "@/lib/types/gateway.types";


const STEAM_HOSTS = {
    webapi: "https://api.steampowered.com",
    store: "https://store.steampowered.com",
} as const;

type SteamApiTarget = keyof typeof STEAM_HOSTS;


const getSteamCredentials = (config: Record<string, string>) => {
    const apiKey = config.apiKey?.trim() || serverEnv.STEAM_API_KEY;
    const defaultSteamId = config.steamId?.trim() || serverEnv.STEAM_ID;
    return { apiKey, defaultSteamId };
};


const resolveEndpointUrl = (api: SteamApiTarget, rawPath: string): URL => {
    const trimmed = rawPath.trim();
    if (!trimmed) {
        throw new Error("Steam endpoint path is required.");
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith("//") || trimmed.includes("\\")) {
        throw new Error("Steam path must be a relative endpoint path, not a full URL.");
    }

    const cleanPath = trimmed.replace(/^\/+/, "");
    if (cleanPath.split("/").some((segment) => segment === "..")) {
        throw new Error("Steam path must not contain '..' segments.");
    }

    const base = STEAM_HOSTS[api];
    const url = new URL(`/${cleanPath}`, base);
    if (url.origin !== base) {
        throw new Error("Resolved Steam URL does not match the allowed Steam host.");
    }
    return url;
};


export const steamBuiltInProvider: BuiltInProviderDefinition = {
    key: "steam",
    defaultSlug: "steam",
    defaultName: "Steam",
    description: "Direct read-only access to the full Steam Web API (api.steampowered.com) and Storefront API (store.steampowered.com).",
    configFields: [
        {
            secret: true,
            key: "apiKey",
            label: "Steam Web API Key",
            envFallback: "STEAM_API_KEY",
            placeholder: "Leave blank to use STEAM_API_KEY env",
        },
        {
            key: "steamId",
            envFallback: "STEAM_ID",
            label: "Default SteamID64",
            placeholder: "e.g. 76561198000000000 (or STEAM_ID env)",
        },
    ],
    tools: [
        {
            name: "request",
            title: "Call Steam API Endpoint",
            readOnly: true,
            description: [
                "Execute any GET request against the Steam Web API (`api: 'webapi'`, base `https://api.steampowered.com`) or Steam Storefront API (`api: 'store'`, base `https://store.steampowered.com`).",
                "For `webapi`, your Steam API key and `format=json` are injected automatically.",
                "Use `\"$STEAM_ID\"` inside any query parameter value (e.g. `params: { steamid: \"$STEAM_ID\" }` or `{ steamids: \"$STEAM_ID\" }`) to substitute the owner's configured SteamID64.",
                "Examples — webapi: `IPlayerService/GetOwnedGames/v1/` (`include_appinfo: true`, `include_played_free_games: true`), `ISteamUser/GetPlayerSummaries/v2/`, `ISteamUserStats/GetPlayerAchievements/v1/`, `IPlayerService/GetRecentlyPlayedGames/v1/`, `ISteamWebAPIUtil/GetSupportedAPIList/v1/`; store: `api/storesearch/`, `api/appdetails`, `appreviews/<appid>`.",
            ].join(" "),
            inputSchema: {
                type: "object",
                required: ["path"],
                properties: {
                    api: {
                        type: "string",
                        enum: ["webapi", "store"],
                        description: "Target Steam host: 'webapi' (api.steampowered.com, default, authenticated) or 'store' (store.steampowered.com, public).",
                    },
                    path: {
                        type: "string",
                        description: "Relative endpoint path, e.g. 'IPlayerService/GetOwnedGames/v1/' or 'api/storesearch/'.",
                    },
                    params: {
                        type: "object",
                        description: "Optional query parameters (strings, numbers, booleans). Use '$STEAM_ID' for the owner's default SteamID64.",
                        additionalProperties: {
                            type: ["string", "number", "boolean"],
                        },
                    },
                },
            },
            execute: async (args, { config, signal }) => {
                const api: SteamApiTarget = args.api === "store" ? "store" : "webapi";
                const rawPath = typeof args.path === "string" ? args.path : "";
                const url = resolveEndpointUrl(api, rawPath);

                const { apiKey, defaultSteamId } = getSteamCredentials(config);
                if (api === "webapi" && !apiKey) {
                    throw new Error("Steam API key is not configured. Add it in the Steam provider config or set STEAM_API_KEY.");
                }

                const rawParams = args.params;
                if (rawParams !== undefined && (typeof rawParams !== "object" || rawParams === null || Array.isArray(rawParams))) {
                    throw new Error("params must be a key-value object.");
                }

                if (rawParams) {
                    for (const [key, rawValue] of Object.entries(rawParams as Record<string, unknown>)) {
                        if (rawValue === undefined || rawValue === null) continue;
                        if (key.toLowerCase() === "key") continue;

                        let value = String(rawValue);
                        if (value.includes("$STEAM_ID")) {
                            if (!defaultSteamId) {
                                throw new Error("Default Steam ID is not configured. Set steamId in the Steam provider config or STEAM_ID env.");
                            }
                            value = value.replaceAll("$STEAM_ID", defaultSteamId);
                        }
                        url.searchParams.set(key, value);
                    }
                }

                if (api === "webapi") {
                    url.searchParams.set("key", apiKey!);
                    if (!url.searchParams.has("format")) {
                        url.searchParams.set("format", "json");
                    }
                }

                try {
                    const res = await fetch(url, { signal });
                    const bodyText = await res.text();
                    if (!res.ok) {
                        throw new Error(`Steam ${api} request failed with HTTP ${res.status}: ${bodyText.slice(0, 300)}`);
                    }
                    try {
                        return JSON.parse(bodyText) as unknown;
                    }
                    catch {
                        return bodyText;
                    }
                }
                catch (err) {
                    const rawMessage = err instanceof Error ? err.message : String(err);
                    const safeMessage = apiKey ? rawMessage.replaceAll(apiKey, "[Redacted]") : rawMessage;
                    throw new Error(safeMessage);
                }
            },
        },
    ],
};
