import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath }));
vi.mock("@/features/family/server/client-ip", () => ({ getClientIp: vi.fn() }));
vi.mock("@/features/family/server/dal", () => ({
  assertParentOf: vi.fn(),
  assertRole: vi.fn(),
}));
vi.mock("@/features/family/server/service", () => ({
  advanceFamilyClock: vi.fn(),
  demoClockEnabled: vi.fn(),
}));

const { advanceFamilyClockAction } = await import("@/features/family/server/actions");
const service = await import("@/features/family/server/service");
const dal = await import("@/features/family/server/dal");

const moved = { offsetDays: 7, today: "2026-11-09", generated: 1, reminders: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(service.demoClockEnabled).mockReturnValue(true);
  vi.mocked(dal.assertRole).mockResolvedValue({
    user: { id: "parent-1", email: "p@example.com" },
    membership: { familyId: "fam-1", role: "parent", status: "approved" },
  });
  vi.mocked(service.advanceFamilyClock).mockResolvedValue(moved);
});

describe("advanceFamilyClockAction", () => {
  it("moves the clock as a parent and refreshes every screen", async () => {
    await expect(advanceFamilyClockAction(null, { days: 7 })).resolves.toEqual({
      ok: true,
      data: moved,
    });
    expect(dal.assertRole).toHaveBeenCalledWith("parent");
    expect(service.advanceFamilyClock).toHaveBeenCalledWith({ days: 7 });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("takes days from a form", async () => {
    const form = new FormData();
    form.set("days", "30");
    await advanceFamilyClockAction(null, form);
    expect(service.advanceFamilyClock).toHaveBeenCalledWith({ days: 30 });
  });

  it("refuses when the deployment has no demo clock", async () => {
    vi.mocked(service.demoClockEnabled).mockReturnValue(false);
    const result = await advanceFamilyClockAction(null, { days: 1 });
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(service.advanceFamilyClock).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([0, 61, 1.5, "soon"])("rejects %s days", async (days) => {
    const result = await advanceFamilyClockAction(null, { days } as never);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(service.advanceFamilyClock).not.toHaveBeenCalled();
  });

  it("refuses a child", async () => {
    vi.mocked(dal.assertRole).mockRejectedValue(new AppError("FORBIDDEN", "You can't do that."));
    const result = await advanceFamilyClockAction(null, { days: 1 });
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(service.advanceFamilyClock).not.toHaveBeenCalled();
  });
});
