import {db} from "@/lib/server/database/db";
import {and, desc, eq, sql} from "drizzle-orm";
import {MCP_RESOURCE} from "@/lib/server/core/mcp/config";
import type {McpClientAccess} from "@/lib/types/gateway.types";
import {clientPolicy, oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken, user, verification} from "@/lib/server/database/schema";


// Signature, issuer, audience and expiry are verified by @better-auth/mcp first.
export const getMcpClientAccess = (accessTokenClaims: Record<string, unknown>): McpClientAccess | null => {
    const userId = accessTokenClaims.sub;
    const clientId = accessTokenClaims.client_id;
    const issuedAt = accessTokenClaims.relayIssuedAt;

    if (
        typeof userId !== "string" || !userId
        || typeof clientId !== "string" || !clientId
        || typeof issuedAt !== "number"
    ) {
        return null;
    }

    const grant = db
        .select({
            clientName: oauthClient.name,
            disabled: oauthClient.disabled,
            readOnly: clientPolicy.readOnly,
            resources: oauthConsent.resources,
            revokedAt: clientPolicy.revokedAt,
            allowedProviderIds: clientPolicy.allowedProviderIds,
        }).from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .innerJoin(user, eq(user.id, oauthConsent.userId))
        .leftJoin(clientPolicy, eq(clientPolicy.clientId, oauthConsent.clientId))
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
        readOnly: grant.readOnly ?? false,
        clientName: grant.clientName || "Unnamed client",
        allowedProviderIds: grant.allowedProviderIds ?? [],
    };
};


export const saveClientPolicy = (input: {
    clientId: string;
    readOnly?: boolean;
    allowedProviderIds?: string[];
    toggleProvider?: { providerId: string; allowed: boolean };
}) => {
    db.transaction((tx) => {
        const now = new Date();
        const existing = tx
            .select()
            .from(clientPolicy)
            .where(eq(clientPolicy.clientId, input.clientId))
            .get();

        const readOnly = input.readOnly ?? existing?.readOnly ?? false;
        let allowedProviderIds = input.allowedProviderIds !== undefined
            ? Array.from(new Set(input.allowedProviderIds))
            : [...(existing?.allowedProviderIds ?? [])];

        if (input.toggleProvider) {
            const { providerId, allowed } = input.toggleProvider;
            allowedProviderIds = allowed
                ? Array.from(new Set([...allowedProviderIds, providerId]))
                : allowedProviderIds.filter((id) => id !== providerId);
        }

        tx.insert(clientPolicy)
            .values({
                readOnly,
                updatedAt: now,
                allowedProviderIds,
                clientId: input.clientId,
            }).onConflictDoUpdate({
            target: clientPolicy.clientId,
            set: {
                readOnly,
                updatedAt: now,
                allowedProviderIds,
            },
        }).run();
    });
};


export const listConnectedClients = (userId: string) => {
    const rows = db
        .select({
            uri: oauthClient.uri,
            name: oauthClient.name,
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
