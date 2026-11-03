import {
  AppError,
  createTimedFetch,
  type ErrorCode,
  errorCodes,
  GENERIC_FAILURE,
  SIGN_IN_AGAIN,
} from "@jarso/core/lib";
import { offlineCopy } from "@jarso/core/offline";
import { env } from "@/config";
import { supabase } from "./supabase/client";

// Same 15 s deadline as the Supabase client; a timeout or network failure comes back as a 503 JA503.
const timedFetch = createTimedFetch({ timeoutMs: 15_000, name: "api" });

type ApiInit = { method?: string; body?: unknown; auth?: boolean };

const isErrorCode = (code: unknown): code is ErrorCode =>
  typeof code === "string" && Object.hasOwn(errorCodes, code);

const isUnavailableBody = (payload: unknown): boolean =>
  typeof payload === "object" && payload !== null && "code" in payload && payload.code === "JA503";

/**
 * Calls the web's /api/v1. Unwraps `{ data }`; turns `{ error }` into an AppError with the
 * server's safe message. INTERNAL and unreadable replies become the generic line, and a
 * network failure or timeout (15 s) the web's offline copy. Never logs the token.
 */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { method = "GET", body, auth = false } = init;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new AppError("UNAUTHORIZED", SIGN_IN_AGAIN);
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await timedFetch(`${env.apiUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new AppError("UNAVAILABLE", offlineCopy.offline, { cause });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 503 && isUnavailableBody(payload)) {
    throw new AppError("UNAVAILABLE", offlineCopy.offline);
  }
  if (payload && typeof payload === "object") {
    if (response.ok && "data" in payload) return payload.data as T;
    if ("error" in payload && payload.error && typeof payload.error === "object") {
      const { code, message } = payload.error as { code?: unknown; message?: unknown };
      if (isErrorCode(code) && code !== "INTERNAL" && typeof message === "string") {
        throw new AppError(code, message);
      }
    }
  }
  throw new AppError("INTERNAL", GENERIC_FAILURE, { cause: { status: response.status } });
}
