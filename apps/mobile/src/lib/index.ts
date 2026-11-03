// The app's utilities. Core's lib comes through here so every consumer gets a configured logger.
// Direct imports, not in this barrel (side effects, platform-bound): `@/lib/api`, `@/lib/query`,
// `@/lib/supabase/client`, `@/lib/supabase/storage`.
export * from "@jarso/core/lib";
export * from "./dates";
export * from "./errors";
export * from "./fonts";

// Explicit export shadows core's logger: ./logger configures it on first evaluation.
export { configureLogger, logger } from "./logger";

export * from "./theme";
export * from "./utils";
