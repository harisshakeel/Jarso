export type LogLevel = "debug" | "info" | "warn" | "error";

const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

type Context = Record<string, unknown>;

// Module state, set once at app start by `configureLogger`. Core never reads the environment.
let minLevel: LogLevel = "info";
let jsonMode = false;

export function configureLogger(opts: { level?: LogLevel; json?: boolean }): void {
  if (opts.level !== undefined) minLevel = opts.level;
  if (opts.json !== undefined) jsonMode = opts.json;
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: serialize(value.cause),
    };
  }
  return value;
}

function write(level: LogLevel, message: string, context?: Context) {
  if (order[level] < order[minLevel]) return;

  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(context ?? {}).map(([k, v]) => [k, serialize(v)])),
  };

  // Structured JSON in production for log drains; readable output in dev.
  const args = jsonMode ? [JSON.stringify(entry)] : [`[${level}] ${message}`, context ?? ""];
  // biome-ignore lint/suspicious/noConsole: logger is the single sanctioned console sink.
  console[level === "debug" ? "log" : level](...args);
}

export const logger = {
  debug: (message: string, context?: Context) => write("debug", message, context),
  info: (message: string, context?: Context) => write("info", message, context),
  warn: (message: string, context?: Context) => write("warn", message, context),
  error: (message: string, context?: Context) => write("error", message, context),
};
