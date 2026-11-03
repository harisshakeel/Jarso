import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    afterCallbacks.push(fn);
  },
}));
vi.mock("@/features/auth/server", () => ({ assertRequestUser: vi.fn() }));
vi.mock("@/features/notifications/server", () => ({
  allowDispatch: vi.fn(),
  dispatchPush: vi.fn(),
  isPushConfigured: vi.fn(),
  isWebPushConfigured: vi.fn(),
}));

const auth = await import("@/features/auth/server");
const notices = await import("@/features/notifications/server");
const { POST } = await import("@/app/api/v1/notices/dispatch/route");

const post = () =>
  POST(new Request("http://localhost/api/v1/notices/dispatch", { method: "POST" }));

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  vi.mocked(auth.assertRequestUser).mockResolvedValue({ id: "u1", email: null });
  vi.mocked(notices.isPushConfigured).mockReturnValue(true);
  vi.mocked(notices.allowDispatch).mockResolvedValue(true);
  vi.mocked(notices.dispatchPush).mockResolvedValue({
    claimed: 0,
    sent: 0,
    dropped: 0,
    failed: 0,
    summarised: 0,
  });
});

describe("POST /api/v1/notices/dispatch", () => {
  it("401s when signed out", async () => {
    vi.mocked(auth.assertRequestUser).mockRejectedValue(
      new AppError("UNAUTHORIZED", "You must be signed in"),
    );
    const res = await post();
    expect(res.status).toBe(401);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("202s and schedules one dispatch", async () => {
    const res = await post();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ data: { queued: true } });
    expect(notices.allowDispatch).toHaveBeenCalledWith("u1");
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]?.();
    expect(notices.dispatchPush).toHaveBeenCalledTimes(1);
  });

  it("never surfaces a dispatch failure", async () => {
    vi.mocked(notices.dispatchPush).mockRejectedValue(new Error("boom"));
    await post();
    await expect(afterCallbacks[0]?.()).resolves.toBeUndefined();
  });

  it("429s over the limit and dispatches nothing", async () => {
    vi.mocked(notices.allowDispatch).mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(429);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("queues with VAPID unset when Expo is on", async () => {
    // isPushConfigured is "any transport": web push off, phone push on.
    vi.mocked(notices.isWebPushConfigured).mockReturnValue(false);
    vi.mocked(notices.isPushConfigured).mockReturnValue(true);
    const res = await post();
    expect(await res.json()).toEqual({ data: { queued: true } });
    expect(afterCallbacks).toHaveLength(1);
  });

  it("202s with queued:false when push is not configured", async () => {
    vi.mocked(notices.isPushConfigured).mockReturnValue(false);
    const res = await post();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ data: { queued: false } });
    expect(afterCallbacks).toHaveLength(0);
    expect(notices.dispatchPush).not.toHaveBeenCalled();
  });
});
