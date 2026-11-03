import type { ActionDraft } from "@jarso/core/guide";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("@/features/allowance/server", () => ({
  changeAllowance: vi.fn(),
  confirmHandover: vi.fn(async () => "confirmed"),
  createGift: vi.fn(async () => "gift-1"),
  getFamilyContext: vi.fn(async () => ({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  })),
}));
vi.mock("@/features/diary", async () => ({
  notEnoughSpendMessage: (await import("@jarso/core/diary")).notEnoughSpendMessage,
}));
vi.mock("@/features/diary/server", () => ({
  recordMoneyReceived: vi.fn(async () => ({ status: "recorded", entryId: "e1" })),
  recordPurchase: vi.fn(async () => ({ status: "recorded", entryId: "e2" })),
}));
vi.mock("@/features/family/server", () => ({ assertRole: vi.fn() }));
vi.mock("@/features/requests/server", () => ({
  completeRequest: vi.fn(async () => "completed"),
  createDeposit: vi.fn(),
  createEmergency: vi.fn(),
  createWithdrawal: vi.fn(),
  decideWithdrawal: vi.fn(),
  getAvailability: vi.fn(async () => ({
    spendMinor: 1240,
    saveMinor: 6400,
    reservedSaveMinor: 0,
    heldSpendMinor: 0,
    availableSpendMinor: 1240,
    availableSaveMinor: 6400,
    takeOutLimitMinor: null,
  })),
  rejectDeposit: vi.fn(),
}));

const allowance = await import("@/features/allowance/server");
const diary = await import("@/features/diary/server");
const family = await import("@/features/family/server");
const requests = await import("@/features/requests/server");
const { confirmActionDraft } = await import("@/features/guide/server/do-action");

const id = "00000000-0000-4000-8000-0000000000a1";
const childId = "00000000-0000-4000-8000-0000000000c1";
const requestId = "00000000-0000-4000-8000-0000000000f1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.assertRole).mockResolvedValue({
    user: { id: childId } as never,
    membership: null,
  });
});

describe("confirmActionDraft: the child's kinds", () => {
  it("writes down money received as the child, keyed by the draft, and reads the jars fresh", async () => {
    const outcome = await confirmActionDraft({
      kind: "money_received",
      id,
      amountMinor: 500,
      jar: "save",
      category: "family",
      label: "Grandma",
    });
    expect(family.assertRole).toHaveBeenCalledWith("child");
    expect(diary.recordMoneyReceived).toHaveBeenCalledWith({
      amountMinor: 500,
      jar: "save",
      category: "family",
      label: "Grandma",
      idempotencyKey: id,
    });
    expect(outcome).toEqual({
      status: "done",
      text: "Done: £5 is written down in Save.",
      figures: { spend: "£12.40", save: "£64" },
    });
    expect(requests.getAvailability).toHaveBeenCalledWith(childId);
  });

  it("says plainly when a purchase is more than Spend has, and records nothing", async () => {
    vi.mocked(diary.recordPurchase).mockResolvedValueOnce({
      status: "not_enough_spend",
      freeMinor: 100,
    });
    const outcome = await confirmActionDraft({
      kind: "purchase",
      id,
      amountMinor: 500,
      category: "snacks",
      label: "crisps",
    });
    expect(outcome.status).toBe("declined");
    expect(outcome.text).toMatch(/more than you have in Spend \(£1\)/);
  });

  it("waits for the parent when jar moves need approval, and is done when they don't", async () => {
    const move: ActionDraft = { kind: "jar_move", id, amountMinor: 300, from: "save", to: "spend" };
    vi.mocked(requests.createWithdrawal).mockResolvedValueOnce({ status: "pending", requestId });
    expect(await confirmActionDraft(move)).toMatchObject({
      status: "waiting",
      text: "Sent: your parent will look at taking £3 out of Save.",
    });
    vi.mocked(requests.createWithdrawal).mockResolvedValueOnce({ status: "done", requestId });
    expect(await confirmActionDraft(move)).toMatchObject({
      status: "done",
      text: "Done: £3 moved from Save to Spend.",
    });
  });

  it("records once on a double tap: the same key, and the second says it's already sent", async () => {
    const move: ActionDraft = { kind: "jar_move", id, amountMinor: 300, from: "spend", to: "save" };
    vi.mocked(requests.createDeposit)
      .mockResolvedValueOnce({ status: "pending", requestId })
      .mockResolvedValueOnce({ status: "already_sent", requestId });
    await confirmActionDraft(move);
    const again = await confirmActionDraft(move);
    expect(requests.createDeposit).toHaveBeenNthCalledWith(1, {
      amountMinor: 300,
      idempotencyKey: id,
    });
    expect(requests.createDeposit).toHaveBeenNthCalledWith(2, {
      amountMinor: 300,
      idempotencyKey: id,
    });
    expect(again).toMatchObject({ status: "waiting", text: "That's already been sent." });
  });

  it("asks for extra money with its reason, and says when a request is over the limit", async () => {
    vi.mocked(requests.createEmergency).mockResolvedValueOnce({ status: "pending", requestId });
    expect(
      await confirmActionDraft({
        kind: "savings_request",
        id,
        request: "emergency",
        amountMinor: 400,
        reason: "school trip",
      }),
    ).toMatchObject({ status: "waiting" });
    expect(requests.createEmergency).toHaveBeenCalledWith({
      amountMinor: 400,
      reason: "school trip",
      idempotencyKey: id,
    });
    vi.mocked(requests.createWithdrawal).mockResolvedValueOnce({
      status: "over_cap",
      period: "week",
      capMinor: 500,
      usedMinor: 400,
    });
    expect(
      await confirmActionDraft({
        kind: "savings_request",
        id,
        request: "withdrawal",
        amountMinor: 400,
        reason: null,
      }),
    ).toMatchObject({ status: "declined", text: expect.stringMatching(/£5 a week/) });
  });
});

describe("confirmActionDraft: the parent's kinds", () => {
  beforeEach(() => {
    vi.mocked(family.assertRole).mockResolvedValue({
      user: { id: "parent-1" } as never,
      membership: null,
    });
  });

  it("hands over the allowance through the hand-over service, as the parent", async () => {
    const outcome = await confirmActionDraft({
      kind: "hand_over_allowance",
      id,
      childId,
      occurrenceId: "00000000-0000-4000-8000-0000000000d1",
      cashMinor: 700,
      savedMinor: 300,
    });
    expect(family.assertRole).toHaveBeenCalledWith("parent");
    expect(allowance.confirmHandover).toHaveBeenCalledWith({
      kind: "allowance",
      id: "00000000-0000-4000-8000-0000000000d1",
      cashMinor: 700,
      savedMinor: 300,
      idempotencyKey: id,
    });
    expect(outcome.text).toBe("Done: handed over. £7 to Spend and £3 to Save.");
    expect(requests.getAvailability).toHaveBeenCalledWith(childId);
  });

  it("gives a gift today, then hands it over into the jar the parent chose", async () => {
    await confirmActionDraft({
      kind: "record_gift",
      id,
      childId,
      amountMinor: 1000,
      jar: "save",
      note: "From Grandma",
    });
    expect(allowance.createGift).toHaveBeenCalledWith({
      childId,
      amountMinor: 1000,
      giveOn: "2026-11-03",
      note: "From Grandma",
      idempotencyKey: id,
    });
    expect(allowance.confirmHandover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "gift", id: "gift-1", cashMinor: 0, savedMinor: 1000 }),
    );
  });

  it("changes the allowance through the schedule service", async () => {
    const outcome = await confirmActionDraft({
      kind: "change_allowance",
      id,
      childId,
      scheduleId: "00000000-0000-4000-8000-0000000000e1",
      amountMinor: 600,
      frequency: "weekly",
      nextOn: "2026-11-06",
    });
    expect(allowance.changeAllowance).toHaveBeenCalledWith({
      scheduleId: "00000000-0000-4000-8000-0000000000e1",
      amountMinor: 600,
      frequency: "weekly",
      nextOn: "2026-11-06",
    });
    expect(outcome.text).toBe("Done: the allowance is now £6 every week.");
  });

  it("decides a request with the service its kind uses", async () => {
    const decide = (request: "withdrawal" | "deposit", approve: boolean): ActionDraft => ({
      kind: "decide_request",
      id,
      childId,
      requestId,
      request,
      amountMinor: 300,
      approve,
    });
    vi.mocked(requests.decideWithdrawal).mockResolvedValueOnce("approved");
    expect((await confirmActionDraft(decide("withdrawal", true))).text).toMatch(/you said yes/);
    expect(requests.decideWithdrawal).toHaveBeenCalledWith({ requestId, approve: true });

    vi.mocked(requests.decideWithdrawal).mockResolvedValueOnce("already_decided");
    expect(await confirmActionDraft(decide("withdrawal", false))).toMatchObject({
      status: "declined",
    });

    await confirmActionDraft(decide("deposit", true));
    expect(requests.completeRequest).toHaveBeenCalledWith({ requestId, idempotencyKey: id });
    vi.mocked(requests.rejectDeposit).mockResolvedValueOnce("rejected");
    expect((await confirmActionDraft(decide("deposit", false))).text).toBe("Done: you said no.");
  });
});

describe("confirmActionDraft: checks", () => {
  it("runs a child's kind only as a child", async () => {
    vi.mocked(family.assertRole).mockRejectedValueOnce(
      new AppError("FORBIDDEN", "You can't do that."),
    );
    await expect(
      confirmActionDraft({
        kind: "purchase",
        id,
        amountMinor: 100,
        category: "snacks",
        label: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(diary.recordPurchase).not.toHaveBeenCalled();
  });

  it("checks a draft from the browser against the form again before anything runs", async () => {
    await expect(
      confirmActionDraft({
        kind: "change_allowance",
        id,
        childId,
        scheduleId: "00000000-0000-4000-8000-0000000000e1",
        amountMinor: 600,
        frequency: "weekly",
        nextOn: "2026-10-01",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", message: "Pick today or a later date." });
    expect(allowance.changeAllowance).not.toHaveBeenCalled();
  });

  it("passes a service's safe refusal through unchanged", async () => {
    vi.mocked(allowance.changeAllowance).mockRejectedValueOnce(
      new AppError("CONFLICT", "This allowance has stopped. Set up a new one."),
    );
    await expect(
      confirmActionDraft({
        kind: "change_allowance",
        id,
        childId,
        scheduleId: "00000000-0000-4000-8000-0000000000e1",
        amountMinor: 600,
        frequency: "weekly",
        nextOn: "2026-11-06",
      }),
    ).rejects.toMatchObject({ message: "This allowance has stopped. Set up a new one." });
  });
});
