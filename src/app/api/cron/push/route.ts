import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/config/env.server";
import { dispatchPush } from "@/features/notifications/server";
import { AppError } from "@/lib";
import { json, withApi } from "@/lib/api";

export const maxDuration = 30;

function sameSecret(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily sweep for web push (FR16): sends any notice of the last day that no action pushed, such
 * as the hourly allowance reminders. Vercel calls it with `Authorization: Bearer $CRON_SECRET`;
 * without that secret the route does not exist.
 */
export const GET = withApi(async (request: Request) => {
  // Read the request first so the route is rendered per request, never prerendered at build.
  const authorization = request.headers.get("authorization");
  const secret = serverEnv.CRON_SECRET;
  if (!secret) throw new AppError("NOT_FOUND", "Not found");
  if (!sameSecret(authorization, secret)) throw new AppError("UNAUTHORIZED", "Unauthorized");
  return json(await dispatchPush(200));
});
