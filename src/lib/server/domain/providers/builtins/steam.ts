import {serverEnv} from "@/env/server";
import type {BuiltInProviderDefinition} from "@/lib/server/domain/providers/types";


const STEAM_API_BASE = "https://api.steampowered.com";
const STEAM_STORE_BASE = "https://store.steampowered.com/api";


const getSteamCredentials = (config: Record<string, string>) => {
    const apiKey = config.apiKey?.trim() || serverEnv.STEAM_API_KEY;
    const defaultSteamId = config.steamId?.trim() || serverEnv.STEAM_ID;
    return { apiKey, defaultSteamId };
};


const requireApiKey = (config: Record<string, string>): string => {
    const { apiKey } = getSteamCredentials(config);
    if (!apiKey) {
        throw new Error("Steam API key is not configured. Add it in the Steam provider config or set STEAM_API_KEY.");
    }
    return apiKey;
};


const resolveSteamId = (args: Record<string, unknown>, config: Record<string, string>): string => {
    const fromArgs = typeof args.steamId === "string" ? args.steamId.trim() : "";
    const steamId = fromArgs || getSteamCredentials(config).defaultSteamId;
    if (!steamId) {
        throw new Error("Steam ID is required. Pass steamId or set a default Steam ID in the Steam provider config / STEAM_ID.");
    }
    return steamId;
};


const fetchJson = async (url: URL, signal: AbortSignal): Promise<Record<string, unknown>> => {
    const res = await fetch(url, { signal });
    if (!res.ok) {
        throw new Error(`Steam API request failed with HTTP ${res.status}`);
    }
    return await res.json() as Record<string, unknown>;
};


export const steamBuiltInProvider: BuiltInProviderDefinition = {
    key: "steam",
    defaultSlug: "steam",
    defaultName: "Steam",
    description: "Built-in Steam Web API & Store tools (profile, library, playtime, achievements, store search).",
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
            name: "get_profile",
            title: "Get Steam Profile",
            description: "Fetch a Steam user's profile summary, online status, and currently played game.",
            readOnly: true,
            inputSchema: {
                type: "object",
                properties: {
                    steamId: { type: "string", description: "64-bit Steam ID (optional if default Steam ID is configured)." },
                },
            },
            execute: async (args, { config, signal }) => {
                const key = requireApiKey(config);
                const steamId = resolveSteamId(args, config);
                const url = new URL(`${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/`);

                url.searchParams.set("key", key);
                url.searchParams.set("steamids", steamId);

                const data = await fetchJson(url, signal);
                const response = data.response as { players?: Array<Record<string, unknown>> } | undefined;
                const player = response?.players?.[0];
                if (!player) return { found: false, steamId };

                return {
                    found: true,
                    steamId: player.steamid,
                    avatar: player.avatarfull,
                    profileUrl: player.profileurl,
                    personaName: player.personaname,
                    personaState: player.personastate,
                    currentGameId: player.gameid ?? null,
                    timeCreated: player.timecreated ?? null,
                    currentGame: player.gameextrainfo ?? null,
                    countryCode: player.loccountrycode ?? null,
                };
            },
        },
        {
            name: "get_owned_games",
            title: "Get Owned Games",
            description: "List owned Steam games with total and recent playtime, with optional filtering and sorting.",
            readOnly: true,
            inputSchema: {
                type: "object",
                properties: {
                    steamId: { type: "string", description: "64-bit Steam ID (optional if default is configured)." },
                    search: { type: "string", description: "Case-insensitive substring filter on game name." },
                    sortBy: { type: "string", enum: ["playtime", "recent", "name"], description: "Sort order (default: playtime)." },
                    limit: { type: "integer", description: "Maximum number of games to return (1-100, default: 25)." },
                },
            },
            execute: async (args, { config, signal }) => {
                const key = requireApiKey(config);
                const steamId = resolveSteamId(args, config);
                const url = new URL(`${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/`);
                
                url.searchParams.set("key", key);
                url.searchParams.set("steamid", steamId);
                url.searchParams.set("include_appinfo", "true");
                url.searchParams.set("include_played_free_games", "true");
                url.searchParams.set("format", "json");

                const data = await fetchJson(url, signal);
                const response = data.response as { game_count?: number; games?: Array<Record<string, unknown>> } | undefined;
                let games = (response?.games ?? []).map((g) => ({
                    appId: Number(g.appid),
                    name: String(g.name ?? ""),
                    playtimeHours: Math.round((Number(g.playtime_forever ?? 0) / 60) * 10) / 10,
                    playtimeMinutes: Number(g.playtime_forever ?? 0),
                    recentMinutes: Number(g.playtime_2weeks ?? 0),
                    lastPlayed: typeof g.rtime_last_played === "number" && g.rtime_last_played > 0
                        ? new Date(g.rtime_last_played * 1000).toISOString()
                        : null,
                }));

                if (typeof args.search === "string" && args.search.trim()) {
                    const needle = args.search.trim().toLowerCase();
                    games = games.filter((g) => g.name.toLowerCase().includes(needle));
                }

                const sortBy = typeof args.sortBy === "string" ? args.sortBy : "playtime";
                if (sortBy === "name") {
                    games.sort((a, b) => a.name.localeCompare(b.name));
                }
                else if (sortBy === "recent") {
                    games.sort((a, b) => b.recentMinutes - a.recentMinutes || b.playtimeMinutes - a.playtimeMinutes);
                }
                else {
                    games.sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);
                }

                const rawLimit = typeof args.limit === "number" ? args.limit : 25;
                const limit = Math.max(1, Math.min(100, Math.floor(rawLimit)));

                return {
                    totalOwned: response?.game_count ?? games.length,
                    matched: games.length,
                    games: games.slice(0, limit),
                };
            },
        },
        {
            name: "get_recently_played",
            title: "Get Recently Played Games",
            description: "Fetch games played by a Steam user in the last two weeks.",
            readOnly: true,
            inputSchema: {
                type: "object",
                properties: {
                    steamId: { type: "string", description: "64-bit Steam ID (optional if default is configured)." },
                    count: { type: "integer", description: "Maximum games to return (default: 10)." },
                },
            },
            execute: async (args, { config, signal }) => {
                const key = requireApiKey(config);
                const steamId = resolveSteamId(args, config);
                const count = typeof args.count === "number" ? Math.max(1, Math.min(50, Math.floor(args.count))) : 10;
                const url = new URL(`${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/`);
                url.searchParams.set("key", key);
                url.searchParams.set("steamid", steamId);
                url.searchParams.set("count", String(count));

                const data = await fetchJson(url, signal);
                const response = data.response as { total_count?: number; games?: Array<Record<string, unknown>> } | undefined;

                return {
                    totalCount: response?.total_count ?? 0,
                    games: (response?.games ?? []).map((g) => ({
                        appId: Number(g.appid),
                        name: String(g.name ?? ""),
                        recentHours: Math.round((Number(g.playtime_2weeks ?? 0) / 60) * 10) / 10,
                        totalHours: Math.round((Number(g.playtime_forever ?? 0) / 60) * 10) / 10,
                    })),
                };
            },
        },
        {
            name: "get_game_achievements",
            title: "Get Game Achievements",
            description: "Get achievement unlock progress for a specific Steam game (appId).",
            readOnly: true,
            inputSchema: {
                type: "object",
                required: ["appId"],
                properties: {
                    appId: { type: "integer", description: "Steam application ID." },
                    steamId: { type: "string", description: "64-bit Steam ID (optional if default is configured)." },
                    onlyUnlocked: { type: "boolean", description: "Return only unlocked achievements." },
                },
            },
            execute: async (args, { config, signal }) => {
                const key = requireApiKey(config);
                const steamId = resolveSteamId(args, config);
                const appId = Number(args.appId);
                if (!Number.isInteger(appId) || appId <= 0) {
                    throw new Error("appId must be a positive integer.");
                }

                const url = new URL(`${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v0001/`);
                url.searchParams.set("key", key);
                url.searchParams.set("steamid", steamId);
                url.searchParams.set("appid", String(appId));
                url.searchParams.set("l", "english");

                const data = await fetchJson(url, signal);
                const stats = data.playerstats as {
                    gameName?: string;
                    success?: boolean;
                    achievements?: Array<{ apiname: string; achieved: number; unlocktime: number; name?: string; description?: string }>;
                } | undefined;

                if (!stats?.success) {
                    return { appId, success: false, achievements: [] };
                }

                const all = stats.achievements ?? [];
                const unlockedCount = all.filter((a) => a.achieved === 1).length;
                const filtered = args.onlyUnlocked ? all.filter((a) => a.achieved === 1) : all;

                return {
                    appId,
                    gameName: stats.gameName ?? null,
                    unlockedCount,
                    totalCount: all.length,
                    completionPercent: all.length > 0 ? Math.round((unlockedCount / all.length) * 1000) / 10 : 0,
                    achievements: filtered.slice(0, 100).map((a) => ({
                        apiName: a.apiname,
                        name: a.name ?? a.apiname,
                        description: a.description ?? "",
                        achieved: a.achieved === 1,
                        unlockTime: a.unlocktime > 0 ? new Date(a.unlocktime * 1000).toISOString() : null,
                    })),
                };
            },
        },
        {
            name: "search_store",
            title: "Search Steam Store",
            description: "Search the Steam Store catalog by title or keyword (returns app IDs, names, and prices).",
            readOnly: true,
            inputSchema: {
                type: "object",
                required: ["query"],
                properties: {
                    query: { type: "string", description: "Search query text." },
                    countryCode: { type: "string", description: "Two-letter country code for pricing (default: FR)." },
                },
            },
            execute: async (args, { signal }) => {
                const query = typeof args.query === "string" ? args.query.trim() : "";
                if (!query) throw new Error("query is required.");

                const cc = typeof args.countryCode === "string" && args.countryCode.trim()
                    ? args.countryCode.trim().toUpperCase()
                    : "FR";

                const url = new URL(`${STEAM_STORE_BASE}/storesearch/`);
                url.searchParams.set("term", query);
                url.searchParams.set("l", "english");
                url.searchParams.set("cc", cc);

                const data = await fetchJson(url, signal);
                const items = (data.items as Array<Record<string, unknown>> | undefined) ?? [];

                return {
                    total: Number(data.total ?? items.length),
                    items: items.slice(0, 20).map((item) => {
                        const price = item.price as { currency?: string; initial?: number; final?: number } | undefined;
                        return {
                            appId: Number(item.id),
                            name: String(item.name ?? ""),
                            type: String(item.type ?? "app"),
                            price: price ? {
                                currency: price.currency,
                                initial: (price.initial ?? 0) / 100,
                                final: (price.final ?? 0) / 100,
                            } : null,
                            metascore: item.metascore ? Number(item.metascore) : null,
                        };
                    }),
                };
            },
        },
        {
            name: "get_app_details",
            title: "Get Steam App Details",
            description: "Fetch Steam Store metadata (description, release date, price, genres, platforms, Metacritic) for an appId.",
            readOnly: true,
            inputSchema: {
                type: "object",
                required: ["appId"],
                properties: {
                    appId: { type: "integer", description: "Steam application ID." },
                    countryCode: { type: "string", description: "Two-letter country code for pricing (default: FR)." },
                },
            },
            execute: async (args, { signal }) => {
                const appId = Number(args.appId);
                if (!Number.isInteger(appId) || appId <= 0) {
                    throw new Error("appId must be a positive integer.");
                }
                const cc = typeof args.countryCode === "string" && args.countryCode.trim()
                    ? args.countryCode.trim().toUpperCase()
                    : "FR";

                const url = new URL(`${STEAM_STORE_BASE}/appdetails`);
                url.searchParams.set("appids", String(appId));
                url.searchParams.set("l", "english");
                url.searchParams.set("cc", cc);

                const data = await fetchJson(url, signal);
                const entry = data[String(appId)] as { success?: boolean; data?: Record<string, unknown> } | undefined;
                if (!entry?.success || !entry.data) {
                    return { found: false, appId };
                }

                const d = entry.data;
                return {
                    found: true,
                    appId,
                    name: d.name,
                    type: d.type,
                    isFree: Boolean(d.is_free),
                    shortDescription: d.short_description,
                    developers: d.developers ?? [],
                    publishers: d.publishers ?? [],
                    releaseDate: d.release_date ?? null,
                    priceOverview: d.price_overview ?? null,
                    metacritic: d.metacritic ?? null,
                    genres: Array.isArray(d.genres) ? d.genres.map((g: { description?: string }) => g.description) : [],
                    platforms: d.platforms ?? null,
                };
            },
        },
    ],
};
