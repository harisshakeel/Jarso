import { after } from "next/server";
import { assertRequestUser } from "@/features/auth/server";
import { allowDispatch, dispatchPush, isPushConfigured } from "@/features/notifications/server";
import { AppError, logger } from "@/lib";
import { json, withApi } from "@/lib/api";

export const maxDuration = 30;

/**
 * For the mobile app: after an action wrote notices, send their web and phone pushes, as the web
 * does with `pushAfterNotices`. Queued when either transport is on (`isPushConfigured`). No body.
 * The send runs after the response and never fails it.
 */
export const POST = withApi(async (request: Request) => {
  const user = await assertRequestUser(request);
  if (!(await allowDispatch(user.id))) {
    throw new AppError("RATE_LIMITED", "Too many tries. Please wait a little while.");
  }
  if (!isPushConfigured()) return json({ queued: false }, { status: 202 });

  after(() =>
    dispatchPush().catch((error: unknown) =>
      logger.error("Push dispatch failed", {
        code: error instanceof AppError ? error.code : "UNKNOWN",
      }),
    ),
  );
  return json({ queued: true }, { status: 202 });
});
