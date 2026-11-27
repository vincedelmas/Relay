import crypto from "node:crypto";
import {desc, lt} from "drizzle-orm";
import {db} from "@/lib/server/database/db";
import {executionLog} from "@/lib/server/database/schema";
import type {RecordExecutionLogInput} from "@/lib/types/gateway.types";


const LOG_RETENTION_DAYS = 30;
const MAX_CODE_LOG_CHARS = 4_000;
const MAX_ERROR_LOG_CHARS = 1_000;


export const recordExecutionLog = (input: RecordExecutionLogInput): void => {
    const now = new Date();

    db.insert(executionLog).values({
        createdAt: now,
        kind: input.kind,
        status: input.status,
        id: crypto.randomUUID(),
        toolName: input.toolName ?? null,
        clientId: input.clientId ?? null,
        toolCallCount: input.toolCallCount,
        clientName: input.clientName ?? null,
        providerSlug: input.providerSlug ?? null,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        code: input.code ? input.code.slice(0, MAX_CODE_LOG_CHARS) : null,
        errorMessage: input.errorMessage ? input.errorMessage.slice(0, MAX_ERROR_LOG_CHARS) : null,
    }).run();

    // Opportunistically prune logs older than 30 days (~2% of writes)
    if (Math.random() < 0.02) {
        const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        db.delete(executionLog)
            .where(lt(executionLog.createdAt, cutoff))
            .run();
    }
};


export const listExecutionLogs = (limit = 100) => {
    return db.select()
        .from(executionLog)
        .orderBy(desc(executionLog.createdAt))
        .limit(Math.max(1, Math.min(250, limit)))
        .all();
};


export const clearExecutionLogs = () => {
    db.delete(executionLog).run();
};
