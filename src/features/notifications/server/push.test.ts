import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimedNotice } from "../types";

const env = vi.hoisted(() => ({
  server: {
    VAPID_PRIVATE_KEY: "private-placeholder",
    VAPID_SUBJECT: undefined as string | undefined,
  },
  client: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-placeholder",
    NEXT_PUBLIC_APP_URL: "https://jarso.test",
  },
}));
const webpush = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
const after = vi.hoisted(() => vi.fn((fn: () => unknown) => fn()));
const repo = vi.hoisted(() => ({
  claimUnpushed: vi.fn(),
  subscriptionsFor: vi.fn(),
  deleteSubscriptionById: vi.fn(async () => undefined),
}));
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after }));
vi.mock("web-push", () => webpush);
vi.mock("@/config/env.server", () => ({ serverEnv: env.server }));
vi.mock("@/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config")>()),
  clientEnv: env.client,
}));
vi.mock("@/lib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib")>()),
  logger: log,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ kind: "admin" }) }));
vi.mock("./repository", () => repo);

const { dispatchPush, drainPush, isPushConfigured, pushAfterNotices, pushPayload } = await import(
  "./push"
);

const claimed = (recipientId: string, id = "n1"): ClaimedNotice => ({
  recipientId,
  role: "parent",
  currency: "GBP",
  notice: {
    id,
    kind: "withdrawal_requested",
    childId: "c1",
    childName: "Sam",
    sourceType: "request",
    sourceId: "r1",
    payload: { amount_minor: 500 },
    createdAt: "2026-10-31T09:00:00Z",
    read: false,
  },
});

const sub = (id: string, profileId: string) => ({
  id,
  profileId,
  endpoint: `https://push.example.test/${id}`,
  p256dh: "p",
  auth: "a",
});

beforeEach(() => {
  vi.clearAllMocks();
  env.server.VAPID_PRIVATE_KEY = "private-placeholder";
  env.client.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-placeholder";
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
});

describe("isPushConfigured", () => {
  it("needs both keys", () => {
    expect(isPushConfigured()).toBe(true);
    env.server.VAPID_PRIVATE_KEY = undefined as unknown as string;
    expect(isPushConfigured()).toBe(false);
  });
});

describe("pushPayload", () => {
  it("carries the inbox row's words, where it opens and the notice id as tag", () => {
    const payload = JSON.parse(pushPayload(claimed("p1")));
    expect(payload).toEqual({
      title: "Sam asked to take money out of Save",
      body: "£5. Your answer is waiting.",
      url: "/parent/children/c1",
      tag: "n1",
    });
  });
});

describe("dispatchPush", () => {
  it("claims nothing while push is off", async () => {
    env.client.NEXT_PUBLIC_VAPID_PUBLIC_KEY = undefined as unknown as string;
    expect(await dispatchPush()).toEqual({ claimed: 0, sent: 0, dropped: 0, failed: 0 });
    expect(repo.claimUnpushed).not.toHaveBeenCalled();
  });

  it("sends each claimed notice to every subscription of its recipient only", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1"), claimed("p2", "n2")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1"), sub("s2", "p1"), sub("s3", "p3")]);
    const result = await dispatchPush(10);
    expect(repo.claimUnpushed).toHaveBeenCalledWith({ kind: "admin" }, 10);
    expect(repo.subscriptionsFor).toHaveBeenCalledWith({ kind: "admin" }, ["p1", "p2"]);
    expect(result).toEqual({ claimed: 2, sent: 2, dropped: 0, failed: 0 });
    const endpoints = webpush.sendNotification.mock.calls.map(
      (call) => (call[0] as { endpoint: string }).endpoint,
    );
    expect(endpoints.sort()).toEqual([
      "https://push.example.test/s1",
      "https://push.example.test/s2",
    ]);
    expect(webpush.sendNotification.mock.calls[0]?.[2]).toEqual({
      TTL: 3600,
      urgency: "normal",
      timeout: 10_000,
    });
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "https://jarso.test",
      "public-placeholder",
      "private-placeholder",
    );
  });

  it("forgets a gone endpoint and counts other failures without throwing", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1"), sub("s2", "p1"), sub("s3", "p1")]);
    webpush.sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ statusCode: 201 });
    const result = await dispatchPush();
    expect(result).toEqual({ claimed: 1, sent: 1, dropped: 1, failed: 1 });
    expect(repo.deleteSubscriptionById).toHaveBeenCalledWith({ kind: "admin" }, "s1");
    expect(log.warn).toHaveBeenCalledWith("Push send failed", { status: null });
  });

  it("does nothing more when nobody subscribed", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([]);
    expect(await dispatchPush()).toEqual({ claimed: 1, sent: 0, dropped: 0, failed: 0 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("never logs an endpoint or the notice text", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1")]);
    await dispatchPush();
    const logged = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls]);
    expect(logged).not.toMatch(/push\.example\.test|Sam|Save/);
  });
});

describe("drainPush", () => {
  it("claims again while a batch comes back full, and adds the counts up", async () => {
    const full = Array.from({ length: 200 }, (_, i) => claimed("p1", `n${i}`));
    repo.claimUnpushed
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([claimed("p1", "last")]);
    repo.subscriptionsFor.mockResolvedValue([]);
    const result = await drainPush(60_000);
    expect(repo.claimUnpushed).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ claimed: 401, sent: 0, dropped: 0, failed: 0 });
  });

  it("stops after one batch when nothing is left", async () => {
    repo.claimUnpushed.mockResolvedValue([]);
    expect(await drainPush(60_000)).toEqual({ claimed: 0, sent: 0, dropped: 0, failed: 0 });
    expect(repo.claimUnpushed).toHaveBeenCalledTimes(1);
  });

  it("stops once the time budget is spent even if batches stay full", async () => {
    const full = Array.from({ length: 200 }, (_, i) => claimed("p1", `n${i}`));
    repo.claimUnpushed.mockResolvedValue(full);
    repo.subscriptionsFor.mockResolvedValue([]);
    const result = await drainPush(0);
    expect(repo.claimUnpushed).toHaveBeenCalledTimes(1);
    expect(result.claimed).toBe(200);
  });
});

describe("pushAfterNotices", () => {
  it("schedules a dispatch after the response when push is on", async () => {
    repo.claimUnpushed.mockResolvedValue([]);
    pushAfterNotices();
    expect(after).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(repo.claimUnpushed).toHaveBeenCalled();
  });

  it("is a no-op when push is off", () => {
    env.server.VAPID_PRIVATE_KEY = undefined as unknown as string;
    pushAfterNotices();
    expect(after).not.toHaveBeenCalled();
  });
});
