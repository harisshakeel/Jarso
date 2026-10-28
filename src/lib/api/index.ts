import { NextResponse } from "next/server";
import { z } from "zod";
import { clientEnv } from "@/config";
import { AppError, isAppError } from "../errors";
import { logger } from "../logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard for cookie-authenticated Route Handlers. Browsers always send `Origin` on
 * non-GET fetches, so a mismatch with our own origin means another site made the request.
 * Requests without an `Origin` header (curl, server-to-server) are allowed; they carry no cookies.
 */
export function assertSameOrigin(request: Request) {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const allowed =
    origin === new URL(clientEnv.NEXT_PUBLIC_APP_URL).origin || new URL(origin).host === host;
  if (!allowed) throw new AppError("FORBIDDEN", "Cross-origin request rejected");
}

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

function toErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json<ApiError>(
      { error: { code: "VALIDATION", message: "Invalid request", details: z.flattenError(error) } },
      { status: 400 },
    );
  }
  if (isAppError(error)) {
    return NextResponse.json<ApiError>(
      { error: { code: error.code, message: error.message, details: error.fieldErrors } },
      { status: error.status },
    );
  }
  logger.error("Unhandled API error", { error });
  return NextResponse.json<ApiError>(
    { error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  );
}

/** Wraps a route handler with the CSRF guard and uniform error → JSON mapping. */
export function withApi<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      const [request] = args;
      if (request instanceof Request) assertSameOrigin(request);
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Parse and validate a JSON body; throws ZodError / AppError handled by `withApi`. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  const body = await request.json().catch(() => {
    throw new AppError("VALIDATION", "Request body must be valid JSON");
  });
  return schema.parse(body);
}
