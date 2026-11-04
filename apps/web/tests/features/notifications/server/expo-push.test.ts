// @vitest-environment node
import type { ClaimedNotice } from "@jarso/core/notifications";
import { noticeText, pushData } from "@jarso/core/notifications";
import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib")>()),
  logger: log,
}));

const { expoMessage, fetchExpoReceipts, sendExpoMessages } = await import(
  "@/features/notifications/server/expo-push"
);
type ExpoMessage = ReturnType<typeof expoMessage>;

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const TOKEN = "ExponentPushToken[secret-device-token]";

const claimed: ClaimedNotice = {
  recipientId: "11111111-1111-4111-8111-111111111111",
  role: "child",
  currency: "GBP",
  overnight: false,
  notice: {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "withdrawal_decided",
    childId: "11111111-1111-4111-8111-111111111111",
    childName: "Sam",
    sourceType: "request",
    sourceId: "33333333-3333-4333-8333-333333333333",
    payload: { amount_minor: 500, approved: true },
    createdAt: "2026-11-03T09:00:00Z",
    read: false,
  },
};

function messages(n: number): ExpoMessage[] {
  return Array.from({ length: n }, (_, i) => expoMessage(claimed, `ExponentPushToken[t${i}]`));
}

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fetch stub that answers each send with one ok ticket per message. */
function echoFetch() {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as ExpoMessage[];
    return okResponse({ data: sent.map((_, i) => ({ status: "ok", id: `id-${i}` })) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendExpoMessages", () => {
  it("posts 250 messages as chunks of 100, 100, 50", async () => {
    const fetchImpl = echoFetch();
    const tickets = await sendExpoMessages(messages(250), fetchImpl as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const sizes = fetchImpl.mock.calls.map(
      ([, init]) => (JSON.parse(String(init?.body)) as unknown[]).length,
    );
    expect(sizes).toEqual([100, 100, 50]);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toBe(SEND_URL);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        Accept: "application/json",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(tickets).toHaveLength(250);
    expect(tickets.every((t) => t.status === "ok")).toBe(true);
  });

  it("maps ok and DeviceNotRegistered tickets in order", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({
        data: [
          { status: "ok", id: "a" },
          {
            status: "error",
            message: "not registered",
            details: { error: "DeviceNotRegistered" },
          },
          { status: "error", message: "odd" },
        ],
      }),
    );
    expect(await sendExpoMessages(messages(3), fetchImpl as typeof fetch)).toEqual([
      { status: "ok", id: "a" },
      { status: "error", error: "DeviceNotRegistered" },
      { status: "error", error: "Unknown" },
    ]);
  });

  it("a failed chunk becomes error tickets and never throws", async () => {
    const transport = { status: "error", error: "Transport" };
    const rejecting = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await sendExpoMessages(messages(2), rejecting as typeof fetch)).toEqual([
      transport,
      transport,
    ]);

    const unavailable = vi.fn(async () => okResponse({ errors: [{ code: "x" }] }, 503));
    expect(await sendExpoMessages(messages(2), unavailable as typeof fetch)).toEqual([
      transport,
      transport,
    ]);

    const short = vi.fn(async () => okResponse({ data: [{ status: "ok", id: "a" }] }));
    expect(await sendExpoMessages(messages(2), short as typeof fetch)).toEqual([
      transport,
      transport,
    ]);

    // Only the failing chunk is lost: the next one still goes.
    let call = 0;
    const firstFails = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      call += 1;
      if (call === 1) throw new Error("boom");
      return echoFetch()(url, init);
    });
    const tickets = await sendExpoMessages(messages(150), firstFails as typeof fetch);
    expect(tickets.slice(0, 100).every((t) => t.status === "error")).toBe(true);
    expect(tickets.slice(100).every((t) => t.status === "ok")).toBe(true);
  });

  it("times out a stalled chunk", async () => {
    vi.useFakeTimers();
    try {
      const stalled = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      const pending = sendExpoMessages(messages(1), stalled as typeof fetch);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toEqual([{ status: "error", error: "Transport" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cuts a chunk's timeout to the time left before the deadline", async () => {
    vi.useFakeTimers();
    try {
      const stalled = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      const pending = sendExpoMessages(messages(1), stalled as typeof fetch, Date.now() + 2_000);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await pending).toEqual([{ status: "error", error: "Transport" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts no chunk once the deadline has passed; the rest become transport errors", async () => {
    vi.useFakeTimers();
    try {
      const slow = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        return echoFetch()(url, init);
      });
      const pending = sendExpoMessages(messages(250), slow as typeof fetch, Date.now() + 2_000);
      await vi.advanceTimersByTimeAsync(10_000);
      const tickets = await pending;
      expect(slow).toHaveBeenCalledTimes(1);
      expect(tickets).toHaveLength(250);
      expect(tickets.slice(0, 100).every((t) => t.status === "ok")).toBe(true);
      expect(tickets.slice(100).every((t) => t.status === "error" && t.error === "Transport")).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends nothing for no messages", async () => {
    const fetchImpl = echoFetch();
    expect(await sendExpoMessages([], fetchImpl as typeof fetch)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchExpoReceipts", () => {
  it("receipts are fetched in chunks of 1000 and keyed by id", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { ids } = JSON.parse(String(init?.body)) as { ids: string[] };
      return okResponse({
        data: Object.fromEntries(
          ids.map((id) => [
            id,
            id === "r-5"
              ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }
              : { status: "ok" },
          ]),
        ),
      });
    });
    const ids = Array.from({ length: 1500 }, (_, i) => `r-${i}`);
    const receipts = await fetchExpoReceipts(ids, fetchImpl as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(RECEIPTS_URL);
    const sizes = fetchImpl.mock.calls.map(
      ([, init]) => (JSON.parse(String(init?.body)) as { ids: string[] }).ids.length,
    );
    expect(sizes).toEqual([1000, 500]);
    expect(receipts.size).toBe(1500);
    expect(receipts.get("r-5")).toEqual({ status: "error", error: "DeviceNotRegistered" });
    expect(receipts.get("r-6")).toEqual({ status: "ok" });
  });

  it("a failed chunk yields no entries and never throws", async () => {
    const rejecting = vi.fn(async () => {
      throw new Error("down");
    });
    expect((await fetchExpoReceipts(["a"], rejecting as typeof fetch)).size).toBe(0);
    const bad = vi.fn(async () => okResponse({}, 500));
    expect((await fetchExpoReceipts(["a"], bad as typeof fetch)).size).toBe(0);
  });
});

describe("expoMessage", () => {
  it("expoMessage uses the inbox row's words and pushData", () => {
    const text = noticeText(claimed.notice, claimed.role, claimed.currency);
    expect(expoMessage(claimed, TOKEN)).toEqual({
      to: TOKEN,
      title: text.title,
      body: text.detail,
      data: pushData(claimed),
      channelId: "notices",
      ttl: 3600,
      priority: "high",
    });
  });
});

describe("logging", () => {
  it("logs never contain a token or notice text", async () => {
    const message = expoMessage(claimed, TOKEN);
    await sendExpoMessages([message], vi.fn(async () => okResponse({}, 503)) as typeof fetch);
    await sendExpoMessages(
      [message],
      vi.fn(async () => {
        throw new Error(`failed for ${TOKEN}`);
      }) as typeof fetch,
    );
    await fetchExpoReceipts(["a"], vi.fn(async () => okResponse({}, 500)) as typeof fetch);
    const logged = JSON.stringify([
      ...log.info.mock.calls,
      ...log.warn.mock.calls,
      ...log.error.mock.calls,
    ]);
    expect(log.warn).toHaveBeenCalled();
    expect(logged).not.toContain("secret-device-token");
    expect(logged).not.toContain(message.title);
    expect(logged).not.toContain(message.body);
  });
});
