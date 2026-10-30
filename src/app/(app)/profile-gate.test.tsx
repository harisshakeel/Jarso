import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/server", () => ({
  getCurrentUser: vi.fn(async () => {
    throw new Error("UNAVAILABLE");
  }),
}));
vi.mock("@/features/family/server", () => ({ currentRole: vi.fn() }));
vi.mock("@/features/profiles", () => ({ ProfileCompletionDialog: () => null }));
vi.mock("@/features/profiles/server", () => ({ isParentProfileComplete: vi.fn() }));
vi.mock("@/lib", () => ({ logger: { warn: vi.fn() } }));

const { ProfileGate } = await import("./profile-gate");

describe("ProfileGate", () => {
  it("fails open when the session lookup throws", async () => {
    await expect(ProfileGate()).resolves.toBeNull();
  });
});
