import "server-only";
import type {
  ClaimedNotice,
  DeviceTokenRow,
  PushPlan,
  PushResult,
  PushSubscriptionRow,
} from "@jarso/core/notifications";
import { noticeText, planForDevice, planPushes, summaryPushText } from "@jarso/core/notifications";
import { after } from "next/server";
import * as webpush from "web-push";
import { clientEnv, routes } from "@/config";
import { serverEnv } from "@/config/env.server";
import { AppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { noticeHref } from "../links";
import {
  type ExpoMessage,
  expoMessage,
  expoSummaryMessage,
  fetchExpoReceipts,
  sendExpoMessages,
} from "./expo-push";
import {
  claimUnpushed,
  deleteDeviceTokenById,
  deleteExpoTickets,
  deleteSubscriptionById,
  deviceTokensFor,
  recordExpoTickets,
  subscriptionsFor,
  takeDueExpoTickets,
} from "./repository";

/**
 * Push delivery (FR16; phones since mobile wave 3). Two transports, each gated on its own
 * config: web push (both VAPID keys) and phones through the Expo Push API (`EXPO_PUSH`, on by
 * default). The inbox row stays the record either way. Each notice is claimed once
 * (`claim_unpushed_notifications`, which also holds a child's notices overnight) and sent to
 * every web subscription and phone token of its recipient; two or more of a child's overnight
 * notices go as one summary push. A dead endpoint (404/410) or token (`DeviceNotRegistered`) is
 * forgotten. Never logs a recipient, an endpoint, a token or the notice text: the logs are public.
 */

/** How long a push service keeps an undelivered notice for an offline device. */
const TTL_SECONDS = 60 * 60;
/** Sends in flight at once: a few dozen notices must not open hundreds of connections. */
const CONCURRENCY = 8;
/** A stalled push service must not hold a worker until the function's own limit. */
const SEND_TIMEOUT_MS = 10_000;
/** How many notices one claim takes; `drainPush` repeats while a batch comes back full. */
const BATCH = 200;

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

/** Web push needs both VAPID keys. */
export function isWebPushConfigured(): boolean {
  return Boolean(serverEnv.VAPID_PRIVATE_KEY && clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

/** Phone push needs no secret; `EXPO_PUSH=off` turns it off. */
export function isExpoPushConfigured(): boolean {
  return serverEnv.EXPO_PUSH !== "off";
}

/** Claiming runs when either transport is on. */
export function isPushConfigured(): boolean {
  return isWebPushConfigured() || isExpoPushConfigured();
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

/** The web payload for a child's overnight summary: opens Notifications, marks nothing read. */
function summaryPayload(recipientId: string, count: number): string {
  const text = summaryPushText(count);
  return JSON.stringify({
    title: text.title,
    body: text.detail,
    url: routes.childInbox,
    tag: `summary:${recipientId}`,
  });
}

function planRecipient(plan: PushPlan): string {
  return plan.kind === "notice" ? plan.claimed.recipientId : plan.recipientId;
}

function statusOf(error: unknown): number | null {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : null;
}

function groupBy<T extends { profileId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.profileId, [...(map.get(row.profileId) ?? []), row]);
  return map;
}

async function sendWeb(
  admin: ReturnType<typeof createAdminClient>,
  plans: PushPlan[],
  subscriptions: PushSubscriptionRow[],
  result: PushResult,
): Promise<void> {
  if (subscriptions.length === 0) return;
  const byRecipient = groupBy(subscriptions);
  configureVapid();
  await runLimited(
    plans.flatMap((plan) => {
      const payload =
        plan.kind === "notice"
          ? pushPayload(plan.claimed)
          : summaryPayload(plan.recipientId, plan.notices.length);
      return (byRecipient.get(planRecipient(plan)) ?? []).map((sub) => async () => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: TTL_SECONDS, urgency: "normal", timeout: SEND_TIMEOUT_MS },
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
      });
    }),
  );
}

async function sendExpo(
  admin: ReturnType<typeof createAdminClient>,
  plans: PushPlan[],
  tokens: DeviceTokenRow[],
  result: PushResult,
  deadline?: number,
): Promise<void> {
  if (tokens.length === 0) return;
  const byRecipient = groupBy(tokens);
  // Each phone's own settings first: a paused phone or a muted group gets no message, and a
  // summary shrinks to the notices this phone still wants.
  const sends: { message: ExpoMessage; tokenId: string }[] = plans.flatMap((plan) =>
    (byRecipient.get(planRecipient(plan)) ?? []).flatMap((row) => {
      const mine = planForDevice(plan, row);
      if (!mine) return [];
      return [
        {
          tokenId: row.id,
          message:
            mine.kind === "notice"
              ? expoMessage(mine.claimed, row.token)
              : expoSummaryMessage(mine.recipientId, mine.notices.length, row.token),
        },
      ];
    }),
  );
  if (sends.length === 0) return;

  const tickets = await sendExpoMessages(
    sends.map((s) => s.message),
    fetch,
    deadline,
  );
  const accepted: { id: string; tokenId: string }[] = [];
  const gone = new Set<string>();
  const failures = new Map<string, number>();
  tickets.forEach((ticket, i) => {
    const tokenId = sends[i]?.tokenId;
    if (!tokenId) return;
    if (ticket.status === "ok") {
      accepted.push({ id: ticket.id, tokenId });
      result.sent += 1;
    } else if (ticket.error === "DeviceNotRegistered") {
      gone.add(tokenId);
      result.dropped += 1;
    } else {
      failures.set(ticket.error, (failures.get(ticket.error) ?? 0) + 1);
      result.failed += 1;
    }
  });
  for (const [error, count] of failures) logger.warn("Expo push failed", { error, count });

  await Promise.all([
    accepted.length > 0
      ? recordExpoTickets(admin, accepted).catch(() => logger.warn("Could not record push tickets"))
      : undefined,
    ...[...gone].map((id) =>
      deleteDeviceTokenById(admin, id).catch(() => logger.warn("Could not drop a gone token")),
    ),
  ]);
}

/**
 * Sends every unpushed notice from the last day. Runs after actions that write notices and from
 * the 15-minute cron sweep; both are safe to repeat because claiming is what marks a notice pushed.
 * `deadline` (epoch ms, set by the sweep) stops the Expo sends in time for the route's limit.
 */
export async function dispatchPush(limit = 50, deadline?: number): Promise<PushResult> {
  const result: PushResult = { claimed: 0, sent: 0, dropped: 0, failed: 0, summarised: 0 };
  if (!isPushConfigured()) return result;
  const admin = createAdminClient();
  const notices = await claimUnpushed(admin, limit);
  // Every claimed row counts, summarised or not, so drainPush sees a full batch as full.
  result.claimed = notices.length;
  if (notices.length === 0) return result;

  const plans = planPushes(notices);
  for (const plan of plans) if (plan.kind === "summary") result.summarised += plan.notices.length;

  const recipients = [...new Set(notices.map((n) => n.recipientId))];
  // Neither lookup failing may cost the other transport the notices already claimed.
  const subscriptions = isWebPushConfigured()
    ? await subscriptionsFor(admin, recipients).catch((error: unknown) => {
        logger.warn("Could not load web push subscriptions", {
          code: error instanceof AppError ? error.code : "UNKNOWN",
        });
        return [];
      })
    : [];
  const tokens = isExpoPushConfigured()
    ? await deviceTokensFor(admin, recipients).catch((error: unknown) => {
        logger.warn("Could not load device tokens", {
          code: error instanceof AppError ? error.code : "UNKNOWN",
        });
        return [];
      })
    : [];

  await Promise.all([
    sendWeb(admin, plans, subscriptions, result),
    sendExpo(admin, plans, tokens, result, deadline).catch(() =>
      logger.warn("Expo push run failed"),
    ),
  ]);
  logger.info("Push dispatched", result);
  return result;
}

/**
 * The sweep: claims batch after batch while a batch comes back full and time remains, so a day
 * with more than one batch of notices is still drained before the one-day cutoff passes.
 */
export async function drainPush(budgetMs: number): Promise<PushResult> {
  const total: PushResult = { claimed: 0, sent: 0, dropped: 0, failed: 0, summarised: 0 };
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const batch = await dispatchPush(BATCH, deadline);
    total.claimed += batch.claimed;
    total.sent += batch.sent;
    total.dropped += batch.dropped;
    total.failed += batch.failed;
    total.summarised += batch.summarised;
    if (batch.claimed < BATCH || Date.now() >= deadline) return total;
  }
}

/**
 * Expo receipts for tickets sent at least 15 minutes ago: a `DeviceNotRegistered` receipt
 * forgets its token. Every taken ticket is deleted, checked or not (Expo keeps receipts a day).
 */
export async function checkExpoReceipts(): Promise<{ checked: number; dropped: number }> {
  if (!isExpoPushConfigured()) return { checked: 0, dropped: 0 };
  const admin = createAdminClient();
  const taken = await takeDueExpoTickets(admin);
  if (taken.length === 0) return { checked: 0, dropped: 0 };

  const receipts = await fetchExpoReceipts(taken.map((t) => t.id));
  const gone = new Set<string>();
  for (const ticket of taken) {
    const receipt = receipts.get(ticket.id);
    if (receipt?.status === "error" && receipt.error === "DeviceNotRegistered") {
      gone.add(ticket.tokenId);
    }
  }
  for (const id of gone) {
    await deleteDeviceTokenById(admin, id).catch(() => logger.warn("Could not drop a gone token"));
  }
  await deleteExpoTickets(
    admin,
    taken.map((t) => t.id),
  );
  const result = { checked: receipts.size, dropped: gone.size };
  logger.info("Expo receipts checked", result);
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
