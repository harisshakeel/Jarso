import { configureLogger, type LogLevel } from "@jarso/core/lib";

const levels: readonly string[] = ["debug", "info", "warn", "error"];

// Isomorphic module, so it cannot import @/config/env.server. This is the one sanctioned
// direct read of process.env outside src/config (see CLAUDE.md rule 11).
const requestedLevel = process.env.LOG_LEVEL;
const level: LogLevel =
  typeof requestedLevel === "string" && levels.includes(requestedLevel)
    ? (requestedLevel as LogLevel)
    : "info";
const isProd = process.env.NODE_ENV === "production";

configureLogger({ level, json: isProd });

export { configureLogger, logger } from "@jarso/core/lib";
