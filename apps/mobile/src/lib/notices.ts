import { apiFetch } from "./api";
import { logger } from "./logger";

/**
 * Asks the server to push what is waiting for the parent (a purchase, say). Fire and forget: the
 * child's own action already succeeded, so a failure is logged and never shown.
 */
export function dispatchNotices(): void {
  apiFetch("/api/v1/notices/dispatch", { method: "POST", auth: true }).catch((error: unknown) => {
    logger.warn("Could not dispatch notices", { error });
  });
}
