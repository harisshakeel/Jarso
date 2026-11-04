import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/config/env.server";
import { checkExpoReceipts, drainPush } from "@/features/notifications/server";
import { AppError, logger } from "@/lib";
import { json, withApi } from "@/lib/api";

export const maxDuration = 30;
/** Leaves room inside maxDuration for the batch in flight to finish. */
const DRAIN_BUDGET_MS = 15_000;

function sameSecret(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Push sweep (FR16, web and phone push): sends any notice of the last day that no action pushed,
 * such as the hourly allowance reminders and a child's notices held overnight by quiet hours
 * (released from 07:00). pg_cron calls it every 15 minutes through pg_net (POST, job
 * `push-sweep`); GET stays for a manual run. Both send `Authorization: Bearer $CRON_SECRET`;
 * without that secret the route does not exist.
 */
const handler = withApi(async (request: Request) => {
  // Read the request first so the route is rendered per request, never prerendered at build.
  const authorization = request.headers.get("authorization");
  const secret = serverEnv.CRON_SECRET;
  if (!secret) throw new AppError("NOT_FOUND", "Not found");
  if (!sameSecret(authorization, secret)) throw new AppError("UNAUTHORIZED", "Unauthorized");
  const drained = await drainPush(DRAIN_BUDGET_MS);
  // Phone receipts after the drain: one Expo request (≤1000 tickets, 10 s timeout) fits in the
  // rest of maxDuration. A failure here is logged and never fails the sweep.
  const receipts = await checkExpoReceipts().catch((error: unknown) => {
    logger.warn("Expo receipt check failed", {
      code: error instanceof AppError ? error.code : "UNKNOWN",
    });
    return { checked: 0, dropped: 0 };
  });
  return json({ ...drained, receipts });
});

export const GET = handler;
export const POST = handler;
