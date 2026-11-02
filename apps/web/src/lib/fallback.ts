import { unstable_rethrow } from "next/navigation";
import { logger } from "./logger";

/**
 * A read that is nice to have: if it fails, use `value` and log, so one failed read never takes
 * down a whole section. Next.js control-flow errors (redirect, notFound) still go through.
 */
export async function fallback<T>(read: Promise<T>, value: T, label: string): Promise<T> {
  try {
    return await read;
  } catch (error) {
    unstable_rethrow(error);
    logger.warn(`${label} unavailable`, {
      error: error instanceof Error ? error.name : typeof error,
    });
    return value;
  }
}
