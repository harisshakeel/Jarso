import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn() }));
vi.mock("@/features/family/server", () => ({ assertRole: vi.fn() }));
vi.mock("./repository", () => ({ callRecordPurchase: vi.fn(), callUndoPurchase: vi.fn() }));

const family = await import("@/features/family/server");
const repo = await import("./repository");
const service = await import("./service");

const child = { id: "child-1", email: "c@example.com" };
const input = { amountMinor: 500, idempotencyKey: "key-1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.assertRole).mockResolvedValue({ user: child, membership: null });
});

describe("recordPurchase", () => {
  it("records for the signed-in child, not an input id", async () => {
    vi.mocked(repo.callRecordPurchase).mockResolvedValue({ status: "recorded", entryId: "e1" });
    await expect(service.recordPurchase({ ...input, label: "Snack" })).resolves.toEqual({
      status: "recorded",
      entryId: "e1",
    });
    expect(family.assertRole).toHaveBeenCalledWith("child");
    expect(repo.callRecordPurchase).toHaveBeenCalledWith(
      { kind: "user" },
      { childId: "child-1", amountMinor: 500, label: "Snack", idempotencyKey: "key-1" },
    );
  });

  it("forwards occurredAt to the RPC", async () => {
    vi.mocked(repo.callRecordPurchase).mockResolvedValue({ status: "recorded", entryId: "e1" });
    await service.recordPurchase({ ...input, occurredAt: "2026-10-29T10:00:00Z" });
    expect(repo.callRecordPurchase).toHaveBeenCalledWith(
      { kind: "user" },
      {
        childId: "child-1",
        amountMinor: 500,
        label: "",
        idempotencyKey: "key-1",
        occurredAt: "2026-10-29T10:00:00Z",
      },
    );
  });

  it("passes not_enough_spend through", async () => {
    vi.mocked(repo.callRecordPurchase).mockResolvedValue({
      status: "not_enough_spend",
      freeMinor: 200,
    });
    await expect(service.recordPurchase(input)).resolves.toEqual({
      status: "not_enough_spend",
      freeMinor: 200,
    });
  });
});

describe("undoPurchase", () => {
  it("returns undone and already_undone", async () => {
    vi.mocked(repo.callUndoPurchase).mockResolvedValue("already_undone");
    await expect(service.undoPurchase("e1")).resolves.toBe("already_undone");
  });

  it("maps too_late to CONFLICT", async () => {
    vi.mocked(repo.callUndoPurchase).mockResolvedValue("too_late");
    await expect(service.undoPurchase("e1")).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You can only undo a purchase within a day.",
    });
  });
});
