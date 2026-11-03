import type { ClaimedNotice } from "@jarso/core/notifications";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  server: {
    VAPID_PRIVATE_KEY: "private-placeholder" as string | undefined,
    VAPID_SUBJECT: undefined as string | undefined,
    EXPO_PUSH: "on" as "on" | "off",
  },
  client: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-placeholder" as string | undefined,
    NEXT_PUBLIC_APP_URL: "https://jarso.test",
  },
}));
const webpush = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
const after = vi.hoisted(() => vi.fn((fn: () => unknown) => fn()));
const repo = vi.hoisted(() => ({
  claimUnpushed: vi.fn(),
  subscriptionsFor: vi.fn(),
  deleteSubscriptionById: vi.fn(async () => undefined),
  deviceTokensFor: vi.fn(),
  deleteDeviceTokenById: vi.fn(async () => undefined),
  recordExpoTickets: vi.fn(async () => undefined),
  takeDueExpoTickets: vi.fn(),
  deleteExpoTickets: vi.fn(async () => undefined),
}));
const expo = vi.hoisted(() => ({ sendExpoMessages: vi.fn(), fetchExpoReceipts: vi.fn() }));
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
vi.mock("@/features/notifications/server/repository", () => repo);
vi.mock("@/features/notifications/server/expo-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/notifications/server/expo-push")>()),
  ...expo,
}));

const {
  checkExpoReceipts,
  dispatchPush,
  drainPush,
  isPushConfigured,
  isWebPushConfigured,
  pushAfterNotices,
  pushPayload,
} = await import("@/features/notifications/server/push");

type Message = { to: string; title: string; body: string; data: Record<string, unknown> };

const claimed = (recipientId: string, id = "n1"): ClaimedNotice => ({
  recipientId,
  role: "parent",
  currency: "GBP",
  overnight: false,
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

/** A child's notice written overnight (held until 07:00). */
const overnight = (recipientId: string, id: string): ClaimedNotice => ({
  recipientId,
  role: "child",
  currency: "GBP",
  overnight: true,
  notice: {
    id,
    kind: "allowance_due",
    childId: recipientId,
    childName: "Sam",
    sourceType: "allowance_occurrence",
    sourceId: "o1",
    payload: { amount_minor: 500 },
    createdAt: "2026-10-31T22:00:00Z",
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

const token = (id: string, profileId: string) => ({
  id,
  profileId,
  token: `ExponentPushToken[${id}-device]`,
});

/** Answers every Expo message with an ok ticket named after its index. */
function expoOk() {
  expo.sendExpoMessages.mockImplementation(async (messages: Message[]) =>
    messages.map((_, i) => ({ status: "ok", id: `ticket-${i}` })),
  );
}

function sentMessages(): Message[] {
  return expo.sendExpoMessages.mock.calls.flatMap((call) => call[0] as Message[]);
}

beforeEach(() => {
  vi.clearAllMocks();
  env.server.VAPID_PRIVATE_KEY = "private-placeholder";
  env.client.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-placeholder";
  env.server.EXPO_PUSH = "on";
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
  repo.subscriptionsFor.mockResolvedValue([]);
  repo.deviceTokensFor.mockResolvedValue([]);
  repo.takeDueExpoTickets.mockResolvedValue([]);
  expo.fetchExpoReceipts.mockResolvedValue(new Map());
  expoOk();
});

describe("transports", () => {
  it("isWebPushConfigured needs both keys", () => {
    expect(isWebPushConfigured()).toBe(true);
    env.server.VAPID_PRIVATE_KEY = undefined;
    expect(isWebPushConfigured()).toBe(false);
  });

  it("isPushConfigured is true with VAPID unset while EXPO_PUSH is on", () => {
    env.server.VAPID_PRIVATE_KEY = undefined;
    expect(isPushConfigured()).toBe(true);
    env.server.EXPO_PUSH = "off";
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
  it("claims nothing when both transports are off", async () => {
    env.client.NEXT_PUBLIC_VAPID_PUBLIC_KEY = undefined;
    env.server.EXPO_PUSH = "off";
    expect(await dispatchPush()).toEqual({
      claimed: 0,
      sent: 0,
      dropped: 0,
      failed: 0,
      summarised: 0,
    });
    expect(repo.claimUnpushed).not.toHaveBeenCalled();
  });

  it("sends each claimed notice to the recipient's web subscriptions and phone tokens only", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1"), claimed("p2", "n2")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1"), sub("s2", "p1"), sub("s3", "p3")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "p1"), token("t3", "p3")]);
    const result = await dispatchPush(10);
    expect(repo.claimUnpushed).toHaveBeenCalledWith({ kind: "admin" }, 10);
    expect(repo.subscriptionsFor).toHaveBeenCalledWith({ kind: "admin" }, ["p1", "p2"]);
    expect(repo.deviceTokensFor).toHaveBeenCalledWith({ kind: "admin" }, ["p1", "p2"]);
    expect(result).toEqual({ claimed: 2, sent: 3, dropped: 0, failed: 0, summarised: 0 });
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
    expect(sentMessages()).toEqual([
      expect.objectContaining({
        to: "ExponentPushToken[t1-device]",
        title: "Sam asked to take money out of Save",
        data: expect.objectContaining({ kind: "notice", noticeId: "n1", recipientId: "p1" }),
      }),
    ]);
  });

  it("three overnight notices for one child send one summary push per subscription and token, titled 'You have 3 new notices', summarised: 3", async () => {
    repo.claimUnpushed.mockResolvedValue([
      overnight("c1", "a"),
      overnight("c1", "b"),
      overnight("c1", "c"),
    ]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "c1")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "c1"), token("t2", "c1")]);
    const result = await dispatchPush();
    expect(result).toEqual({ claimed: 3, sent: 3, dropped: 0, failed: 0, summarised: 3 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(webpush.sendNotification.mock.calls[0]?.[1] as string).title).toBe(
      "You have 3 new notices",
    );
    expect(sentMessages().map((m) => [m.to, m.title])).toEqual([
      ["ExponentPushToken[t1-device]", "You have 3 new notices"],
      ["ExponentPushToken[t2-device]", "You have 3 new notices"],
    ]);
  });

  it("one overnight notice is pushed as itself", async () => {
    repo.claimUnpushed.mockResolvedValue([overnight("c1", "a")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "c1")]);
    const result = await dispatchPush();
    expect(result.summarised).toBe(0);
    expect(sentMessages()[0]?.data).toMatchObject({ kind: "notice", noticeId: "a" });
  });

  it("parent notices are never summarised", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1", "a"), claimed("p1", "b")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "p1")]);
    const result = await dispatchPush();
    expect(result).toMatchObject({ sent: 2, summarised: 0 });
    expect(sentMessages().map((m) => m.data.noticeId)).toEqual(["a", "b"]);
  });

  it("the summary's web payload opens /child/inbox and its Expo data is kind summary", async () => {
    repo.claimUnpushed.mockResolvedValue([overnight("c1", "a"), overnight("c1", "b")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "c1")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "c1")]);
    await dispatchPush();
    expect(JSON.parse(webpush.sendNotification.mock.calls[0]?.[1] as string)).toEqual({
      title: "You have 2 new notices",
      body: "They came in overnight. Open News to see them.",
      url: "/child/inbox",
      tag: "summary:c1",
    });
    expect(sentMessages()[0]?.data).toEqual({
      kind: "summary",
      recipientId: "c1",
      role: "child",
      count: 2,
    });
  });

  it("DeviceNotRegistered ticket deletes the token and counts dropped", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "p1"), token("t2", "p1")]);
    expo.sendExpoMessages.mockResolvedValue([
      { status: "error", error: "DeviceNotRegistered" },
      { status: "error", error: "MessageRateExceeded" },
    ]);
    const result = await dispatchPush();
    expect(result).toEqual({ claimed: 1, sent: 0, dropped: 1, failed: 1, summarised: 0 });
    expect(repo.deleteDeviceTokenById).toHaveBeenCalledWith({ kind: "admin" }, "t1");
    expect(repo.deleteDeviceTokenById).toHaveBeenCalledTimes(1);
    expect(repo.recordExpoTickets).not.toHaveBeenCalled();
  });

  it("ok tickets are recorded with their token id", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "p1"), token("t2", "p1")]);
    await dispatchPush();
    expect(repo.recordExpoTickets).toHaveBeenCalledWith({ kind: "admin" }, [
      { id: "ticket-0", tokenId: "t1" },
      { id: "ticket-1", tokenId: "t2" },
    ]);
  });

  it("expo failure does not stop web push", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "p1")]);
    expo.sendExpoMessages.mockResolvedValue([{ status: "error", error: "Transport" }]);
    const result = await dispatchPush();
    expect(result).toEqual({ claimed: 1, sent: 1, dropped: 0, failed: 1, summarised: 0 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("a token lookup failure does not stop web push", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1")]);
    repo.deviceTokensFor.mockRejectedValue(new Error("db down"));
    const result = await dispatchPush();
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(expo.sendExpoMessages).not.toHaveBeenCalled();
  });

  it("web push only when VAPID is set", async () => {
    env.server.VAPID_PRIVATE_KEY = undefined;
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "p1")]);
    const result = await dispatchPush();
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(repo.subscriptionsFor).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(expo.sendExpoMessages).toHaveBeenCalledTimes(1);
  });

  it("Expo only when EXPO_PUSH is on", async () => {
    env.server.EXPO_PUSH = "off";
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "p1")]);
    const result = await dispatchPush();
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(repo.deviceTokensFor).not.toHaveBeenCalled();
    expect(expo.sendExpoMessages).not.toHaveBeenCalled();
  });

  it("forgets a gone endpoint and counts other failures without throwing", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1"), sub("s2", "p1"), sub("s3", "p1")]);
    webpush.sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ statusCode: 201 });
    const result = await dispatchPush();
    expect(result).toEqual({ claimed: 1, sent: 1, dropped: 1, failed: 1, summarised: 0 });
    expect(repo.deleteSubscriptionById).toHaveBeenCalledWith({ kind: "admin" }, "s1");
    expect(log.warn).toHaveBeenCalledWith("Push send failed", { status: null });
  });

  it("does nothing more when nobody subscribed", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    expect(await dispatchPush()).toEqual({
      claimed: 1,
      sent: 0,
      dropped: 0,
      failed: 0,
      summarised: 0,
    });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(expo.sendExpoMessages).not.toHaveBeenCalled();
  });

  it("never logs an endpoint, a token or the notice text", async () => {
    repo.claimUnpushed.mockResolvedValue([claimed("p1")]);
    repo.subscriptionsFor.mockResolvedValue([sub("s1", "p1")]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "p1")]);
    expo.sendExpoMessages.mockResolvedValue([{ status: "error", error: "Transport" }]);
    await dispatchPush();
    const logged = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls]);
    expect(logged).not.toMatch(/push\.example\.test|ExponentPushToken|t1-device|Sam|Save|p1/);
  });
});

describe("drainPush", () => {
  it("claims again while a batch comes back full, and adds the counts up", async () => {
    const full = Array.from({ length: 200 }, (_, i) => claimed("p1", `n${i}`));
    repo.claimUnpushed
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([claimed("p1", "last")]);
    const result = await drainPush(60_000);
    expect(repo.claimUnpushed).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ claimed: 401, sent: 0, dropped: 0, failed: 0, summarised: 0 });
  });

  it("a summary counts its notices toward a full batch", async () => {
    const batch = [
      ...Array.from({ length: 100 }, (_, i) => overnight("c1", `a${i}`)),
      ...Array.from({ length: 100 }, (_, i) => overnight("c2", `b${i}`)),
    ];
    repo.claimUnpushed.mockResolvedValueOnce(batch).mockResolvedValueOnce([]);
    repo.deviceTokensFor.mockResolvedValue([token("t1", "c1"), token("t2", "c2")]);
    const result = await drainPush(60_000);
    expect(repo.claimUnpushed).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ claimed: 200, sent: 2, dropped: 0, failed: 0, summarised: 200 });
  });

  it("stops after one batch when nothing is left", async () => {
    repo.claimUnpushed.mockResolvedValue([]);
    expect(await drainPush(60_000)).toEqual({
      claimed: 0,
      sent: 0,
      dropped: 0,
      failed: 0,
      summarised: 0,
    });
    expect(repo.claimUnpushed).toHaveBeenCalledTimes(1);
  });

  it("stops once the time budget is spent even if batches stay full", async () => {
    const full = Array.from({ length: 200 }, (_, i) => claimed("p1", `n${i}`));
    repo.claimUnpushed.mockResolvedValue(full);
    const result = await drainPush(0);
    expect(repo.claimUnpushed).toHaveBeenCalledTimes(1);
    expect(result.claimed).toBe(200);
  });
});

describe("checkExpoReceipts", () => {
  it("checkExpoReceipts deletes tokens with DeviceNotRegistered receipts and deletes every taken ticket", async () => {
    repo.takeDueExpoTickets.mockResolvedValue([
      { id: "r1", tokenId: "t1" },
      { id: "r2", tokenId: "t2" },
      { id: "r3", tokenId: "t3" },
      { id: "r4", tokenId: "t1" },
    ]);
    expo.fetchExpoReceipts.mockResolvedValue(
      new Map([
        ["r1", { status: "error", error: "DeviceNotRegistered" }],
        ["r2", { status: "ok" }],
        ["r3", { status: "error", error: "MessageTooBig" }],
        ["r4", { status: "error", error: "DeviceNotRegistered" }],
      ]),
    );
    expect(await checkExpoReceipts()).toEqual({ checked: 4, dropped: 1 });
    expect(expo.fetchExpoReceipts).toHaveBeenCalledWith(["r1", "r2", "r3", "r4"]);
    expect(repo.deleteDeviceTokenById).toHaveBeenCalledTimes(1);
    expect(repo.deleteDeviceTokenById).toHaveBeenCalledWith({ kind: "admin" }, "t1");
    expect(repo.deleteExpoTickets).toHaveBeenCalledWith({ kind: "admin" }, [
      "r1",
      "r2",
      "r3",
      "r4",
    ]);
  });

  it("does nothing when no ticket is due or Expo push is off", async () => {
    expect(await checkExpoReceipts()).toEqual({ checked: 0, dropped: 0 });
    expect(expo.fetchExpoReceipts).not.toHaveBeenCalled();
    env.server.EXPO_PUSH = "off";
    expect(await checkExpoReceipts()).toEqual({ checked: 0, dropped: 0 });
    expect(repo.takeDueExpoTickets).toHaveBeenCalledTimes(1);
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

  it("is a no-op when both transports are off", () => {
    env.server.VAPID_PRIVATE_KEY = undefined;
    env.server.EXPO_PUSH = "off";
    pushAfterNotices();
    expect(after).not.toHaveBeenCalled();
  });
});
