import "server-only";
import { after } from "next/server";
import * as webpush from "web-push";
import { clientEnv } from "@/config";
import { serverEnv } from "@/config/env.server";
import { AppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { noticeHref, noticeText } from "../links";
import type { ClaimedNotice, PushResult } from "../types";
import { claimUnpushed, deleteSubscriptionById, subscriptionsFor } from "./repository";

/**
 * Web push delivery (FR16). Optional: nothing runs unless both VAPID keys are set, and the inbox
 * row stays the record either way. Each notice is claimed once (`claim_unpushed_notifications`)
 * and sent to every subscription of its recipient; a dead endpoint (404/410) is forgotten.
 * Never logs a recipient, an endpoint or the notice text: the logs are public.
 */

/** How long a push service keeps an undelivered notice for an offline device. */
const TTL_SECONDS = 60 * 60;
/** Sends in flight at once: a few dozen notices must not open hundreds of connections. */
const CONCURRENCY = 8;

/** Runs `tasks` with at most `CONCURRENCY` in flight; every task settles, none throws. */
async function runLimited(tasks: Array<() => Promise<void>>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      if (task) await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
}

export function isPushConfigured(): boolean {
  return Boolean(serverEnv.VAPID_PRIVATE_KEY && clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

let vapidSet = false;
function configureVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(
    serverEnv.VAPID_SUBJECT ?? clientEnv.NEXT_PUBLIC_APP_URL,
    clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    serverEnv.VAPID_PRIVATE_KEY ?? "",
  );
  vapidSet = true;
}

/** What the service worker shows: the inbox row's own words, and where it opens. */
export function pushPayload(claimed: ClaimedNotice): string {
  const text = noticeText(claimed.notice, claimed.role, claimed.currency);
  return JSON.stringify({
    title: text.title,
    body: text.detail,
    url: noticeHref(claimed.notice, claimed.role),
    tag: claimed.notice.id,
  });
}

function statusOf(error: unknown): number | null {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : null;
}

/**
 * Sends every unpushed notice from the last day. Runs after actions that write notices and from
 * the daily cron sweep; both are safe to repeat because claiming is what marks a notice pushed.
 */
export async function dispatchPush(limit = 50): Promise<PushResult> {
  const result: PushResult = { claimed: 0, sent: 0, dropped: 0, failed: 0 };
  if (!isPushConfigured()) return result;
  const admin = createAdminClient();
  const notices = await claimUnpushed(admin, limit);
  result.claimed = notices.length;
  if (notices.length === 0) return result;

  const recipients = [...new Set(notices.map((n) => n.recipientId))];
  const subscriptions = await subscriptionsFor(admin, recipients);
  if (subscriptions.length === 0) {
    logger.info("Push dispatched", result);
    return result;
  }
  const byRecipient = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    byRecipient.set(sub.profileId, [...(byRecipient.get(sub.profileId) ?? []), sub]);
  }

  configureVapid();
  await runLimited(
    notices.flatMap((claimed) =>
      (byRecipient.get(claimed.recipientId) ?? []).map((sub) => async () => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload(claimed),
            { TTL: TTL_SECONDS, urgency: "normal" },
          );
          result.sent += 1;
        } catch (error) {
          const status = statusOf(error);
          if (status === 404 || status === 410) {
            await deleteSubscriptionById(admin, sub.id).catch(() =>
              logger.warn("Could not drop a gone subscription"),
            );
            result.dropped += 1;
          } else {
            result.failed += 1;
            logger.warn("Push send failed", { status });
          }
        }
      }),
    ),
  );
  logger.info("Push dispatched", result);
  return result;
}

/**
 * For actions and routes that just wrote notices: send them once the response is out, so the
 * form never waits on a push service. A no-op when push is off.
 */
export function pushAfterNotices(): void {
  if (!isPushConfigured()) return;
  after(() =>
    dispatchPush().catch((error: unknown) =>
      logger.error("Push dispatch failed", {
        code: error instanceof AppError ? error.code : "UNKNOWN",
      }),
    ),
  );
}
