type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
const isProd = process.env.NODE_ENV === "production";

type Context = Record<string, unknown>;

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

function write(level: Level, message: string, context?: Context) {
  if (order[level] < order[minLevel]) return;

  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(context ?? {}).map(([k, v]) => [k, serialize(v)])),
  };

  // Structured JSON in production for log drains; readable output in dev.
  const args = isProd ? [JSON.stringify(entry)] : [`[${level}] ${message}`, context ?? ""];
  // biome-ignore lint/suspicious/noConsole: logger is the single sanctioned console sink.
  console[level === "debug" ? "log" : level](...args);
}

export const logger = {
  debug: (message: string, context?: Context) => write("debug", message, context),
  info: (message: string, context?: Context) => write("info", message, context),
  warn: (message: string, context?: Context) => write("warn", message, context),
  error: (message: string, context?: Context) => write("error", message, context),
};
