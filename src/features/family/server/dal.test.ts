import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/features/auth/server", () => ({
  assertUser: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("./repository", () => ({
  findMembership: vi.fn(),
  findProfileRole: vi.fn(),
  isParentOf: vi.fn(),
}));

const auth = await import("@/features/auth/server");
const repo = await import("./repository");
const { requireRole } = await import("./dal");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.getCurrentUser).mockResolvedValue(null);
  // Mirrors the real requireUser: the current user, or a redirect to the parent login.
  vi.mocked(auth.requireUser).mockImplementation(async (next) => {
    const user = await auth.getCurrentUser();
    if (user) return user;
    throw new Error(`NEXT_REDIRECT /login?next=${encodeURIComponent(next ?? "")}`);
  });
});

describe("requireRole when signed out", () => {
  it("sends a parent page to the parent login with next", async () => {
    await expect(requireRole("parent", "/parent")).rejects.toThrow(
      "NEXT_REDIRECT /login?next=%2Fparent",
    );
    expect(auth.requireUser).toHaveBeenCalledWith("/parent");
  });

  it("sends a child page to the child PIN sign-in, not the parent login", async () => {
    await expect(requireRole("child", "/child")).rejects.toThrow("NEXT_REDIRECT /sign-in/child");
    expect(auth.requireUser).not.toHaveBeenCalled();
  });
});

describe("requireRole when signed in", () => {
  it("lets a child through to a child page", async () => {
    const child = { id: "child-1", email: null };
    vi.mocked(auth.getCurrentUser).mockResolvedValue(child);
    vi.mocked(repo.findMembership).mockResolvedValue({
      familyId: "fam-1",
      role: "child",
      status: "approved",
    });

    await expect(requireRole("child", "/child")).resolves.toMatchObject({ user: child });
  });
});
