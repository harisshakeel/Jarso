import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/config/env.server";
import { runAutoCharges } from "@/features/payments/server";
import { AppError } from "@/lib";
import { json, withApi } from "@/lib/api";
import { paymentProviderName } from "@/lib/payments";

export const maxDuration = 60;

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`. */
function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Charges every due item with auto charge on. Called hourly by pg_cron through pg_net (POST) and
 * daily by Vercel Cron (GET) as a fallback; the job claims each item once, so a doubled run is
 * harmless. Off (404) without CRON_SECRET or with payments off.
 */
const handler = withApi(async (req: Request) => {
  const secret = serverEnv.CRON_SECRET;
  if (!secret || paymentProviderName() === null) throw new AppError("NOT_FOUND", "Not found");
  if (!authorized(req.headers.get("authorization"), secret)) {
    throw new AppError("UNAUTHORIZED", "Unauthorized");
  }
  return json(await runAutoCharges());
});

export const GET = handler;
export const POST = handler;
