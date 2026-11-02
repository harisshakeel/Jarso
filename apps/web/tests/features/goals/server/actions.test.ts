import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/allowance/server", () => ({ getFamilyContext: vi.fn() }));
vi.mock("@/features/goals/server/service", () => ({
  archiveGoal: vi.fn(),
  markCelebrated: vi.fn(),
  saveGoal: vi.fn(),
}));

const { markCelebratedAction } = await import("@/features/goals/server/actions");
const service = await import("@/features/goals/server/service");

beforeEach(() => vi.clearAllMocks());

describe("markCelebratedAction", () => {
  it("records the moment without refreshing Home, so the child keeps seeing it", async () => {
    const goalId = "11111111-1111-4111-8111-111111111111";
    await expect(markCelebratedAction(null, { goalId })).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    expect(service.markCelebrated).toHaveBeenCalledWith(goalId);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
