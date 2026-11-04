import "server-only";
import type { ClaimedNotice, PushData } from "@jarso/core/notifications";
import { noticeText, pushData, summaryPushData, summaryPushText } from "@jarso/core/notifications";
import { logger } from "@/lib";

/**
 * Expo Push API client for phone push (mobile wave 3). Needs no Jarso secret: Expo holds the FCM
 * credentials uploaded to EAS. Never throws, so a slow, failing or absent Expo never stops web
 * push or the sweep. Logs carry counts and HTTP statuses only, never a token, a recipient or
 * the notice text: the logs are public.
 */

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo's limit per send request. */
const SEND_CHUNK = 100;
/** Expo's limit per receipts request. */
const RECEIPT_CHUNK = 1000;
/** A stalled Expo must not hold the sweep until the function's own limit. */
const TIMEOUT_MS = 10_000;
/** How long Expo/FCM keep an undelivered push for an offline phone (as web push). */
const TTL_SECONDS = 3600;

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: PushData;
  channelId: "notices";
  ttl: typeof TTL_SECONDS;
  priority: "high";
};

/** Expo's answer for one message. `Transport`: the request for its chunk failed. */
export type ExpoTicket = { status: "ok"; id: string } | { status: "error"; error: string };

export type ExpoReceipt = { status: "ok" } | { status: "error"; error: string };

const TRANSPORT: ExpoTicket = { status: "error", error: "Transport" };

/** A phone push for one claimed notice: the inbox row's own words (as web push) and its target. */
export function expoMessage(claimed: ClaimedNotice, token: string): ExpoMessage {
  const text = noticeText(claimed.notice, claimed.role, claimed.currency);
  return {
    to: token,
    title: text.title,
    body: text.detail,
    data: pushData(claimed),
    channelId: "notices",
    ttl: TTL_SECONDS,
    priority: "high",
  };
}

/** A phone push for a child's notices held overnight: one line, opens Notifications, marks nothing read. */
export function expoSummaryMessage(recipientId: string, count: number, token: string): ExpoMessage {
  const text = summaryPushText(count);
  return {
    to: token,
    title: text.title,
    body: text.detail,
    data: summaryPushData(recipientId, count),
    channelId: "notices",
    ttl: TTL_SECONDS,
    priority: "high",
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** POSTs JSON with a timeout; resolves the parsed body of a 2xx answer, or null. */
async function postJson(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<unknown> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: deadline.signal,
    });
    if (!response.ok) {
      logger.warn("Expo push request failed", { status: response.status });
      return null;
    }
    return await response.json();
  } catch {
    logger.warn("Expo push request failed", {
      reason: deadline.signal.aborted ? "timeout" : "network",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function errorName(item: { details?: unknown }): string {
  const name = (item.details as { error?: unknown } | undefined)?.error;
  return typeof name === "string" && name.length > 0 && name.length <= 100 ? name : "Unknown";
}

function toTicket(item: unknown): ExpoTicket {
  const t = item as { status?: unknown; id?: unknown; details?: unknown } | null;
  if (t?.status === "ok" && typeof t.id === "string" && t.id.length > 0) {
    return { status: "ok", id: t.id };
  }
  return { status: "error", error: t ? errorName(t) : "Unknown" };
}

/**
 * Sends in chunks of 100, one after another; one ticket per message, in order. Never throws.
 * `deadline` (epoch ms) bounds the whole run: each request waits at most the time left, and no
 * chunk starts once it has passed, so its messages become transport errors.
 */
export async function sendExpoMessages(
  messages: ExpoMessage[],
  fetchImpl: typeof fetch = fetch,
  deadline = Number.POSITIVE_INFINITY,
): Promise<ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (const chunk of chunks(messages, SEND_CHUNK)) {
    const left = deadline - Date.now();
    if (left <= 0) {
      tickets.push(...chunk.map(() => TRANSPORT));
      continue;
    }
    const answer = await postJson(SEND_URL, chunk, fetchImpl, Math.min(TIMEOUT_MS, left));
    const data = (answer as { data?: unknown } | null)?.data;
    if (!Array.isArray(data) || data.length !== chunk.length) {
      if (answer !== null) logger.warn("Expo push answer unusable", { messages: chunk.length });
      tickets.push(...chunk.map(() => TRANSPORT));
      continue;
    }
    tickets.push(...data.map(toTicket));
  }
  return tickets;
}

/** Delivery receipts by ticket id, in chunks of 1000. A failed chunk yields no entries. */
export async function fetchExpoReceipts(
  ids: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, ExpoReceipt>> {
  const receipts = new Map<string, ExpoReceipt>();
  for (const chunk of chunks(ids, RECEIPT_CHUNK)) {
    const answer = await postJson(RECEIPTS_URL, { ids: chunk }, fetchImpl);
    const data = (answer as { data?: unknown } | null)?.data;
    if (!data || typeof data !== "object") continue;
    for (const id of chunk) {
      const item = (data as Record<string, unknown>)[id] as
        | { status?: unknown; details?: unknown }
        | undefined;
      if (!item) continue;
      receipts.set(
        id,
        item.status === "ok" ? { status: "ok" } : { status: "error", error: errorName(item) },
      );
    }
  }
  return receipts;
}
