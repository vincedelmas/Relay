import pino from "pino";
import "@tanstack/react-start/server-only";


const usePrettyLogs = process.env.NODE_ENV !== "production"
    && process.env.NODE_ENV !== "test"
    && process.stdout.isTTY;


export const logger = pino({
    name: "relay",
    level: process.env.NODE_ENV === "test" ? "silent" : "info",
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
});
