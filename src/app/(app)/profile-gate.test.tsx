// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/features/auth/server", () => ({ getCurrentUser }));
vi.mock("@/features/family/server", () => ({ currentRole: vi.fn() }));
vi.mock("@/features/profiles", () => ({ ProfileCompletionDialog: () => null }));
vi.mock("@/features/profiles/server", () => ({ isParentProfileComplete: vi.fn() }));
vi.mock("@/lib", () => ({ logger: { warn: vi.fn() } }));

const { ProfileGate } = await import("./profile-gate");

/** Shaped like the errors Next throws to steer rendering; `unstable_rethrow` knows them. */
function nextError(digest: string) {
  return Object.assign(new Error(digest), { digest });
}

function rejectWith(error: Error) {
  getCurrentUser.mockImplementation(async () => {
    throw error;
  });
}

describe("ProfileGate", () => {
  it("fails open when the session lookup throws", async () => {
    rejectWith(new Error("UNAVAILABLE"));
    await expect(ProfileGate()).resolves.toBeNull();
  });

  it.each([
    ["a prerender bail-out", "DYNAMIC_SERVER_USAGE"],
    ["a redirect", "NEXT_REDIRECT;replace;/login;307;"],
  ])("rethrows %s instead of swallowing it", async (_name, digest) => {
    const error = nextError(digest);
    rejectWith(error);
    await expect(ProfileGate()).rejects.toBe(error);
  });
});
