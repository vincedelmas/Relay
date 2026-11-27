import {db} from "@/lib/server/database/db";
import {and, desc, eq, gt, sql} from "drizzle-orm";
import {MCP_RESOURCE} from "@/lib/server/core/mcp/config";
import {ClientGatewayMode, clientPolicy, oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken, session, user, verification} from "@/lib/server/database/schema";


export interface McpClientAccess {
    userId: string;
    clientId: string;
    readOnly: boolean;
    clientName: string;
    mode: ClientGatewayMode;
    allowedProviderIds: string[];
}


// Signature, issuer, audience and expiry are verified by @better-auth/mcp first.
export const getMcpClientAccess = (accessTokenClaims: Record<string, unknown>): McpClientAccess | null => {
    const userId = accessTokenClaims.sub;
    const sessionId = accessTokenClaims.sid;
    const clientId = accessTokenClaims.client_id;
    const issuedAt = accessTokenClaims.relayIssuedAt;

    if (
        typeof userId !== "string" || !userId
        || typeof clientId !== "string" || !clientId
        || typeof sessionId !== "string" || !sessionId
        || typeof issuedAt !== "number"
    ) {
        return null;
    }

    const grant = db
        .select({
            mode: clientPolicy.mode,
            clientName: oauthClient.name,
            disabled: oauthClient.disabled,
            readOnly: clientPolicy.readOnly,
            resources: oauthConsent.resources,
            revokedAt: clientPolicy.revokedAt,
            allowedProviderIds: clientPolicy.allowedProviderIds,
        }).from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .innerJoin(user, eq(user.id, oauthConsent.userId))
        .innerJoin(session, and(
            eq(session.id, sessionId),
            gt(session.expiresAt, new Date()),
            eq(session.userId, oauthConsent.userId),
        )).leftJoin(clientPolicy, eq(clientPolicy.clientId, oauthConsent.clientId))
        .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
        .get();

    if (
        !grant
        || grant.disabled
        || !grant.resources?.includes(MCP_RESOURCE)
        || (grant.revokedAt !== null && issuedAt <= grant.revokedAt)
    ) {
        return null;
    }

    return {
        userId,
        clientId,
        mode: grant.mode ?? "code",
        readOnly: grant.readOnly ?? false,
        clientName: grant.clientName || "Unnamed client",
        allowedProviderIds: grant.allowedProviderIds ?? [],
    };
};


export const saveClientPolicy = (input: {
    clientId: string;
    readOnly: boolean;
    mode: ClientGatewayMode;
    allowedProviderIds: string[];
}) => {
    const now = new Date();
    const deduped = Array.from(new Set(input.allowedProviderIds));

    db.insert(clientPolicy)
        .values({
            updatedAt: now,
            mode: input.mode,
            clientId: input.clientId,
            readOnly: input.readOnly,
            allowedProviderIds: deduped,
        }).onConflictDoUpdate({
        target: clientPolicy.clientId,
        set: {
            updatedAt: now,
            mode: input.mode,
            readOnly: input.readOnly,
            allowedProviderIds: deduped,
        },
    }).run();
};


export const listConnectedClients = (userId: string) => {
    const rows = db
        .select({
            uri: oauthClient.uri,
            name: oauthClient.name,
            mode: clientPolicy.mode,
            scopes: oauthConsent.scopes,
            clientId: oauthConsent.clientId,
            readOnly: clientPolicy.readOnly,
            createdAt: oauthConsent.createdAt,
            allowedProviderIds: clientPolicy.allowedProviderIds,
        }).from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .leftJoin(clientPolicy, eq(clientPolicy.clientId, oauthConsent.clientId))
        .where(eq(oauthConsent.userId, userId))
        .orderBy(desc(oauthConsent.createdAt))
        .all();

    return rows.map((row) => ({
        uri: row.uri,
        scopes: row.scopes,
        clientId: row.clientId,
        createdAt: row.createdAt,
        readOnly: row.readOnly ?? false,
        name: row.name || "Unnamed client",
        mode: row.mode ?? ("code" as ClientGatewayMode),
        allowedProviderIds: row.allowedProviderIds ?? [],
    }));
};


export const revokeClientConnection = (userId: string, clientId: string) => {
    db.transaction((tx) => {
        const now = new Date();
        const revokedAt = now.getTime();

        tx.insert(clientPolicy)
            .values({
                clientId,
                revokedAt,
                mode: "code",
                updatedAt: now,
                readOnly: true,
                allowedProviderIds: [],
            }).onConflictDoUpdate({
            target: clientPolicy.clientId,
            set: {
                revokedAt,
                updatedAt: now,
            },
        }).run();

        tx.delete(oauthAccessToken)
            .where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, clientId)))
            .run();

        tx.delete(oauthRefreshToken)
            .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)))
            .run();

        const authorization = sql`CASE WHEN json_valid(${verification.value}) THEN ${verification.value} ELSE '{}' END`;
        tx.delete(verification)
            .where(and(
                sql`json_extract(${authorization}, '$.type') = 'authorization_code'`,
                sql`CAST(json_extract(${authorization}, '$.userId') AS TEXT) = ${userId}`,
                sql`json_extract(${authorization}, '$.query.client_id') = ${clientId}`,
            )).run();

        tx.delete(oauthConsent)
            .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
            .run();
    });
};
