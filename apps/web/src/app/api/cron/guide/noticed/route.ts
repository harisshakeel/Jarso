import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/config/env.server";
import { runGuideNoticed } from "@/features/guide/server";
import { AppError } from "@/lib";
import { json, withApi } from "@/lib/api";

export const maxDuration = 60;
/** Leaves room inside maxDuration for the children in flight to finish. */
const RUN_BUDGET_MS = 40_000;

function sameSecret(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Jarso noticed (demo 3): the weekly nudges. Vercel calls it on Sunday evening with
 * `Authorization: Bearer $CRON_SECRET`; without that secret the route does not exist. A repeat
 * is harmless: a signal is sent once, and a child gets at most one nudge in 6 days.
 */
export const GET = withApi(async (request: Request) => {
  // Read the request first so the route is rendered per request, never prerendered at build.
  const authorization = request.headers.get("authorization");
  const secret = serverEnv.CRON_SECRET;
  if (!secret) throw new AppError("NOT_FOUND", "Not found");
  if (!sameSecret(authorization, secret)) throw new AppError("UNAUTHORIZED", "Unauthorized");
  return json(await runGuideNoticed({ budgetMs: RUN_BUDGET_MS }));
});
