import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/features/allowance/server/service", () => ({
  getFamilyContext: vi.fn(async () => ({ currency: "GBP", timezone: "UTC", today: "2026-10-30" })),
  matchSaving: vi.fn(),
}));
vi.mock("@/features/notifications/server", () => ({
  pushAfterNotices: vi.fn(),
  sendChildNote: vi.fn(),
}));

const service = await import("@/features/allowance/server/service");
const notifications = await import("@/features/notifications/server");
const { matchSavingAction } = await import("@/features/allowance/server/actions");

// Test fixture UUIDs, held in consts so the secrets scan doesn't read them as keys.
const childId = "6f1c2a52-3c4e-4c8e-9a51-0a1b2c3d4e5f";
const sheetId = "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f";
const input = { childId, amount: "7", message: "I matched your saving!", idempotencyKey: sheetId };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(service.matchSaving).mockResolvedValue("confirmed");
});

describe("matchSavingAction", () => {
  it("adds the money, then sends the note with the same key and pushes it", async () => {
    vi.mocked(notifications.sendChildNote).mockResolvedValue("sent");
    await expect(matchSavingAction(null, input)).resolves.toEqual({
      ok: true,
      data: { result: "confirmed", noted: true },
    });
    expect(service.matchSaving).toHaveBeenCalledWith({
      childId: input.childId,
      amountMinor: 700,
      idempotencyKey: input.idempotencyKey,
    });
    expect(notifications.sendChildNote).toHaveBeenCalledWith({
      childId: input.childId,
      text: "I matched your saving!",
      idempotencyKey: input.idempotencyKey,
    });
    expect(notifications.pushAfterNotices).toHaveBeenCalledTimes(1);
  });

  it("keeps the money in when the note fails, and says the note didn't go", async () => {
    vi.mocked(notifications.sendChildNote).mockRejectedValue(
      new AppError("RATE_LIMITED", "That's a lot of notes today. Send more tomorrow."),
    );
    await expect(matchSavingAction(null, input)).resolves.toEqual({
      ok: true,
      data: { result: "confirmed", noted: false },
    });
    expect(notifications.pushAfterNotices).not.toHaveBeenCalled();
  });

  it("sends no note when the parent left it blank", async () => {
    await expect(matchSavingAction(null, { ...input, message: "" })).resolves.toMatchObject({
      ok: true,
      data: { noted: false },
    });
    expect(notifications.sendChildNote).not.toHaveBeenCalled();
  });
});
