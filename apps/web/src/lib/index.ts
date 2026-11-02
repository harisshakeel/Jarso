// Isomorphic utilities — safe in Server and Client Components.
// Environment-specific entry points live in their own modules:
//   @/lib/api (route handlers), @/lib/supabase/{client,server,admin,proxy}
export * from "@jarso/core/lib";
export * from "./action";
export * from "./fallback";

// Explicit export shadows core's logger: ./logger configures it from the environment on first
// evaluation, so every @/lib consumer gets a configured logger.
export { configureLogger, logger } from "./logger";

export * from "./timed-fetch";
export * from "./utils";
