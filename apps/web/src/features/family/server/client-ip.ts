import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort client IP for rate-limit keys: the first `x-forwarded-for` hop, else `x-real-ip`,
 * else "unknown". Spoofable off-platform, so it only ever narrows limits, never grants access.
 */
export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || requestHeaders.get("x-real-ip")?.trim() || "unknown";
}
