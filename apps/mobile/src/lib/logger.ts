import { configureLogger } from "@jarso/core/lib";

// Readable lines in development, warnings and errors only in a release build. Never log
// tokens, PINs or amounts tied to a child id.
configureLogger({ level: __DEV__ ? "debug" : "warn", json: false });

export { configureLogger, logger } from "@jarso/core/lib";
