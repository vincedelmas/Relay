import {and, eq} from "drizzle-orm";
import crypto from "node:crypto";
import {clientEnv} from "@/env/client";
import {db} from "@/lib/server/database/db";
import {logger} from "@/lib/server/core/logger";
import {provider, providerOauthState} from "@/lib/server/database/schema";
import type {FetchLike} from "@modelcontextprotocol/sdk/shared/transport.js";
import {decryptJson, decryptSecret, encryptJson, encryptSecret} from "@/lib/server/core/crypto";
import type {OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens} from "@modelcontextprotocol/sdk/shared/auth.js";
import {auth as mcpClientAuth, discoverOAuthServerInfo, type OAuthClientProvider, type OAuthDiscoveryState, refreshAuthorization} from "@modelcontextprotocol/sdk/client/auth.js";


const REFRESH_LEEWAY_MS = 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_REFRESH_TIMEOUT_MS = 10_000;
const UPSTREAM_OAUTH_CALLBACK_URL = new URL("/api/providers/oauth/callback", clientEnv.VITE_BASE_URL).href;


type StoredOAuthTokens = OAuthTokens & {
    obtainedAt?: number;
};


export class UpstreamReauthRequiredError extends Error {
    constructor(providerName: string, reason?: string) {
        super(reason
            ? `Provider "${providerName}" requires OAuth reconnection in the Relay dashboard (${reason}).`
            : `Provider "${providerName}" is not connected. Connect it via OAuth in the Relay dashboard.`);

        this.name = "UpstreamReauthRequiredError";
    }
}


// Per-provider single-flight lock preventing concurrent rotating-refresh-token races
const refreshLocks = new Map<string, Promise<void>>();
const disconnectGenerations = new Map<string, number>();


const createTimeoutFetch = (timeoutMs: number): FetchLike => (input, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    return fetch(input, { ...init, signal });
};


const awaitWithSignal = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return promise;
    if (signal.aborted) {
        return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Request aborted"));
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error("Request aborted"));
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (val) => {
                signal.removeEventListener("abort", onAbort);
                resolve(val);
            },
            (err) => {
                signal.removeEventListener("abort", onAbort);
                reject(err);
            },
        );
    });
};


const getStateRow = (providerId: string) => {
    return db.select()
        .from(providerOauthState)
        .where(eq(providerOauthState.providerId, providerId))
        .get();
};


const upsertStateRow = (providerId: string, values: Partial<typeof providerOauthState.$inferInsert>) => {
    const now = new Date();

    db.insert(providerOauthState)
        .values({
            providerId,
            ...values,
            updatedAt: now,
        }).onConflictDoUpdate({
        target: providerOauthState.providerId,
        set: {
            ...values,
            updatedAt: now,
        },
    }).run();
};


export class RelayUpstreamOAuthProvider implements OAuthClientProvider {
    public pendingAuthorizationUrl?: URL;

    constructor(
        private readonly providerId: string,
        private readonly providerName: string,
        private readonly interactive: boolean,
    ) {
    }

    get redirectUrl(): string {
        return UPSTREAM_OAUTH_CALLBACK_URL;
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            response_types: ["code"],
            client_name: "Relay MCP Gateway",
            token_endpoint_auth_method: "none",
            client_uri: clientEnv.VITE_BASE_URL,
            redirect_uris: [UPSTREAM_OAUTH_CALLBACK_URL],
            grant_types: ["authorization_code", "refresh_token"],
        };
    }

    state(): string {
        const nonce = crypto.randomBytes(24).toString("base64url");

        upsertStateRow(this.providerId, {
            oauthState: nonce,
            oauthStateExpiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
        });

        return nonce;
    }

    async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
        const row = getStateRow(this.providerId);
        if (!row?.encryptedClientInfo) return undefined;

        return decryptJson<OAuthClientInformationMixed>(row.encryptedClientInfo);
    }

    async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
        const encryptedClientInfo = await encryptJson(clientInformation);
        upsertStateRow(this.providerId, { encryptedClientInfo });
    }

    async tokens(): Promise<OAuthTokens | undefined> {
        const row = getStateRow(this.providerId);
        if (!row?.encryptedTokens) return undefined;

        const stored = await decryptJson<StoredOAuthTokens>(row.encryptedTokens);
        const { obtainedAt: _obtainedAt, ...oauthTokens } = stored;

        return oauthTokens;
    }

    async saveTokens(tokens: OAuthTokens): Promise<void> {
        const stored: StoredOAuthTokens = { ...tokens, obtainedAt: Date.now() };
        const encryptedTokens = await encryptJson(stored);

        upsertStateRow(this.providerId, {
            encryptedTokens,
            oauthState: null,
            oauthStateExpiresAt: null,
            encryptedCodeVerifier: null,
        });
    }

    redirectToAuthorization(authorizationUrl: URL): void {
        if (this.interactive) {
            this.pendingAuthorizationUrl = authorizationUrl;
            return;
        }

        throw new UpstreamReauthRequiredError(this.providerName);
    }

    async saveCodeVerifier(codeVerifier: string): Promise<void> {
        const encryptedCodeVerifier = await encryptSecret(codeVerifier);
        upsertStateRow(this.providerId, { encryptedCodeVerifier });
    }

    async codeVerifier(): Promise<string> {
        const row = getStateRow(this.providerId);
        if (!row?.encryptedCodeVerifier) {
            throw new Error("Missing PKCE code verifier for upstream OAuth flow.");
        }

        return decryptSecret(row.encryptedCodeVerifier);
    }

    discoveryState(): OAuthDiscoveryState | undefined {
        return getStateRow(this.providerId)?.discoveryState ?? undefined;
    }

    saveDiscoveryState(discoveryState: OAuthDiscoveryState): void {
        upsertStateRow(this.providerId, { discoveryState });
    }

    invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
        if (scope === "all") {
            clearUpstreamOAuthState(this.providerId);
            return;
        }

        const patch: Partial<typeof providerOauthState.$inferInsert> = {};

        if (scope === "client") patch.encryptedClientInfo = null;
        if (scope === "tokens") patch.encryptedTokens = null;
        if (scope === "verifier") patch.encryptedCodeVerifier = null;
        if (scope === "discovery") patch.discoveryState = null;

        upsertStateRow(this.providerId, patch);
    }
}


export const hasStoredUpstreamTokens = (providerId: string): boolean => {
    const row = getStateRow(providerId);
    return Boolean(row?.encryptedTokens);
};


export const clearUpstreamOAuthState = (providerId: string): void => {
    disconnectGenerations.set(providerId, (disconnectGenerations.get(providerId) ?? 0) + 1);
    db.delete(providerOauthState)
        .where(eq(providerOauthState.providerId, providerId))
        .run();
};


export const ensureFreshUpstreamTokens = async (
    providerRow: { id: string; name: string; url: string | null },
    options?: { force?: boolean; signal?: AbortSignal },
): Promise<void> => {
    if (!providerRow.url) throw new Error(`Provider "${providerRow.name}" has no URL configured.`);

    const stateRow = getStateRow(providerRow.id);
    if (!stateRow?.encryptedTokens) {
        throw new UpstreamReauthRequiredError(providerRow.name);
    }

    const stored = await decryptJson<StoredOAuthTokens>(stateRow.encryptedTokens);
    const expiresAtMs = stored.obtainedAt && stored.expires_in
        ? stored.obtainedAt + stored.expires_in * 1000
        : undefined;

    const needsRefresh = options?.force
        || (expiresAtMs !== undefined && Date.now() + REFRESH_LEEWAY_MS >= expiresAtMs);

    if (!needsRefresh) return;

    const existingLock = refreshLocks.get(providerRow.id);
    if (existingLock) {
        await awaitWithSignal(existingLock, options?.signal);
        return;
    }

    const refreshPromise = (async () => {
        try {
            // Re-read after acquiring lock in case another caller just refreshed
            const generation = disconnectGenerations.get(providerRow.id) ?? 0;
            const latestRow = getStateRow(providerRow.id);
            if (!latestRow?.encryptedTokens) {
                throw new UpstreamReauthRequiredError(providerRow.name);
            }
            const startingEncryptedTokens = latestRow.encryptedTokens;
            const latestTokens = await decryptJson<StoredOAuthTokens>(startingEncryptedTokens);
            const latestExpiresAt = latestTokens.obtainedAt && latestTokens.expires_in
                ? latestTokens.obtainedAt + latestTokens.expires_in * 1000
                : undefined;

            if (!options?.force && latestExpiresAt !== undefined && Date.now() + REFRESH_LEEWAY_MS < latestExpiresAt) {
                return;
            }

            if (!latestTokens.refresh_token) {
                throw new UpstreamReauthRequiredError(providerRow.name, "access token expired and no refresh token is available");
            }

            const clientInformation = latestRow.encryptedClientInfo
                ? await decryptJson<OAuthClientInformationMixed>(latestRow.encryptedClientInfo)
                : undefined;
            if (!clientInformation) {
                throw new UpstreamReauthRequiredError(providerRow.name, "missing OAuth client registration");
            }

            const fetchFn = createTimeoutFetch(OAUTH_REFRESH_TIMEOUT_MS);
            const discovery = latestRow.discoveryState
                ?? await discoverOAuthServerInfo(providerRow.url!, { fetchFn });

            const resource = discovery.resourceMetadata?.resource;
            const refreshed = await refreshAuthorization(discovery.authorizationServerUrl, {
                metadata: discovery.authorizationServerMetadata,
                clientInformation,
                refreshToken: latestTokens.refresh_token,
                resource,
                fetchFn,
            });

            if ((disconnectGenerations.get(providerRow.id) ?? 0) !== generation) {
                throw new UpstreamReauthRequiredError(providerRow.name, "disconnected during token refresh");
            }

            const encryptedTokens = await encryptJson<StoredOAuthTokens>({
                ...refreshed,
                obtainedAt: Date.now(),
            });

            const updated = db.update(providerOauthState)
                .set({
                    encryptedTokens,
                    discoveryState: discovery,
                    updatedAt: new Date(),
                })
                .where(and(
                    eq(providerOauthState.providerId, providerRow.id),
                    eq(providerOauthState.encryptedTokens, startingEncryptedTokens),
                ))
                .run();

            if (updated.changes === 0) {
                throw new UpstreamReauthRequiredError(providerRow.name, "OAuth state changed during token refresh");
            }

            logger.info({ providerId: providerRow.id, provider: providerRow.name }, "Refreshed upstream OAuth tokens");
        }
        catch (err) {
            if (err instanceof UpstreamReauthRequiredError) throw err;
            logger.warn({ err, providerId: providerRow.id }, "Upstream OAuth token refresh failed");
            throw new UpstreamReauthRequiredError(providerRow.name, "token refresh failed");
        }
        finally {
            refreshLocks.delete(providerRow.id);
        }
    })();

    // Prevent unhandled rejection if caller aborts while shared refresh completes in background
    void refreshPromise.catch(() => undefined);
    refreshLocks.set(providerRow.id, refreshPromise);
    await awaitWithSignal(refreshPromise, options?.signal);
};


export const startUpstreamOAuthFlow = async (providerId: string): Promise<{ authorizationUrl?: string; alreadyAuthorized: boolean }> => {
    const row = db.select().from(provider).where(eq(provider.id, providerId)).get();
    if (!row || row.kind !== "remote_mcp" || !row.url) {
        throw new Error("Remote MCP provider not found.");
    }

    const oauthProvider = new RelayUpstreamOAuthProvider(row.id, row.name, true);
    const result = await mcpClientAuth(oauthProvider, { serverUrl: row.url });

    if (result === "AUTHORIZED") {
        return { alreadyAuthorized: true };
    }

    if (!oauthProvider.pendingAuthorizationUrl) {
        throw new Error("Upstream OAuth flow did not produce an authorization URL.");
    }

    return {
        alreadyAuthorized: false,
        authorizationUrl: oauthProvider.pendingAuthorizationUrl.toString(),
    };
};


export const finishUpstreamOAuthCallback = async (state: string, code: string): Promise<{ providerId: string; slug: string }> => {
    const stateRow = db.select().from(providerOauthState).where(eq(providerOauthState.oauthState, state)).get();
    if (!stateRow || !stateRow.oauthStateExpiresAt || stateRow.oauthStateExpiresAt.getTime() < Date.now()) {
        throw new Error("Invalid or expired OAuth state parameter.");
    }

    const row = db.select().from(provider).where(eq(provider.id, stateRow.providerId)).get();
    if (!row || !row.url) {
        throw new Error("Associated provider no longer exists.");
    }

    const oauthProvider = new RelayUpstreamOAuthProvider(row.id, row.name, false);
    const result = await mcpClientAuth(oauthProvider, {
        serverUrl: row.url,
        authorizationCode: code,
    });

    if (result !== "AUTHORIZED") {
        throw new Error("Upstream OAuth token exchange did not complete.");
    }

    return { providerId: row.id, slug: row.slug };
};
