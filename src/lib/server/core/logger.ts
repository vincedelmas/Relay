import pino from "pino";
import path from "node:path";
import "@tanstack/react-start/server-only";
import {createStream} from "rotating-file-stream";


const loggingConfig = {
    rotatedFiles: 5,
    filePrefix: "relay-",
    maxFileBytes: 2 * 1024 * 1024,
    writeFiles: process.env.NODE_ENV === "production",
    level: process.env.NODE_ENV === "test" ? "silent" : "info",
    directory: process.env.NODE_ENV === "production" ? "/data/logs" : path.resolve("logs"),
};


const usePrettyLogs = process.env.NODE_ENV !== "production"
    && process.env.NODE_ENV !== "test"
    && process.stdout.isTTY;


const fileStream = loggingConfig.writeFiles
    ? createStream(`${loggingConfig.filePrefix}app.log`, {
        path: loggingConfig.directory,
        rotate: loggingConfig.rotatedFiles,
        size: `${Math.floor(loggingConfig.maxFileBytes * 0.8)}B`,
    })
    : undefined;


export const logger = pino({
    name: "relay",
    level: loggingConfig.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: usePrettyLogs
        ? {
            target: "pino-pretty",
            options: {
                colorize: true,
                ignore: "pid,hostname,name",
                translateTime: "SYS:standard",
            },
        }
        : undefined,
    redact: {
        paths: [
            "token",
            "secret",
            "apiKey",
            "cookie",
            "*.token",
            "password",
            "*.secret",
            "*.password",
            "accessToken",
            "refreshToken",
            "*.accessToken",
            "*.refreshToken",
            "headers.cookie",
            "*.authorization",
            "headers.authorization",
        ],
        censor: "[Redacted]",
    },
}, fileStream ? pino.multistream([
    { level: "trace", stream: process.stdout },
    { level: "trace", stream: fileStream },
]) : undefined);
