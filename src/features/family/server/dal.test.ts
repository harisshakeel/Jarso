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
vi.mock("@/features/profiles/server", () => ({ isParentProfileComplete: vi.fn() }));

const auth = await import("@/features/auth/server");
const repo = await import("./repository");
const profiles = await import("@/features/profiles/server");
const { assertParentCanRead, assertParentOf, assertRole, assertSelfOrParentOf, requireRole } =
  await import("./dal");

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

describe("assertSelfOrParentOf", () => {
  it("lets the child read their own money without a parent check", async () => {
    const child = { id: "child-1", email: null };
    vi.mocked(auth.assertUser).mockResolvedValue(child);

    await expect(assertSelfOrParentOf("child-1")).resolves.toBe(child);
    expect(repo.isParentOf).not.toHaveBeenCalled();
  });

  it("rejects another child", async () => {
    vi.mocked(auth.assertUser).mockResolvedValue({ id: "child-2", email: null });
    vi.mocked(auth.getCurrentUser).mockResolvedValue({ id: "child-2", email: null });
    vi.mocked(repo.findMembership).mockResolvedValue({
      familyId: "fam-1",
      role: "child",
      status: "approved",
    });

    await expect(assertSelfOrParentOf("child-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a parent of the child through", async () => {
    const parent = { id: "parent-1", email: "p@example.com" };
    vi.mocked(auth.assertUser).mockResolvedValue(parent);
    vi.mocked(auth.getCurrentUser).mockResolvedValue(parent);
    vi.mocked(repo.findMembership).mockResolvedValue({
      familyId: "fam-1",
      role: "parent",
      status: "approved",
    });
    vi.mocked(repo.isParentOf).mockResolvedValue(true);
    vi.mocked(profiles.isParentProfileComplete).mockResolvedValue(true);

    await expect(assertSelfOrParentOf("child-1")).resolves.toBe(parent);
  });

  it("lets a parent of the child read before their profile is complete", async () => {
    const parent = { id: "parent-1", email: "p@example.com" };
    vi.mocked(auth.assertUser).mockResolvedValue(parent);
    vi.mocked(auth.getCurrentUser).mockResolvedValue(parent);
    vi.mocked(repo.findMembership).mockResolvedValue({
      familyId: "fam-1",
      role: "parent",
      status: "approved",
    });
    vi.mocked(repo.isParentOf).mockResolvedValue(true);
    vi.mocked(profiles.isParentProfileComplete).mockResolvedValue(false);

    await expect(assertSelfOrParentOf("child-1")).resolves.toBe(parent);
  });
});

describe("assertParentOf vs assertParentCanRead (ADR 0008)", () => {
  const parent = { id: "parent-1", email: "p@example.com" };

  beforeEach(() => {
    vi.mocked(auth.assertUser).mockResolvedValue(parent);
    vi.mocked(auth.getCurrentUser).mockResolvedValue(parent);
    vi.mocked(repo.findMembership).mockResolvedValue({
      familyId: "fam-1",
      role: "parent",
      status: "approved",
    });
    vi.mocked(repo.isParentOf).mockResolvedValue(true);
    vi.mocked(profiles.isParentProfileComplete).mockResolvedValue(false);
  });

  // Parent pages render behind the completion dialog, so their reads must not throw.
  it("lets an incomplete parent read their child's data", async () => {
    await expect(assertParentCanRead("child-1")).resolves.toBe(parent);
  });

  it("still refuses an incomplete parent's actions", async () => {
    await expect(assertParentOf("child-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Finish your profile first.",
    });
  });

  it("refuses a read of a child who isn't theirs", async () => {
    vi.mocked(repo.isParentOf).mockResolvedValue(false);

    await expect(assertParentCanRead("child-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a parent-only read by a child", async () => {
    vi.mocked(repo.findMembership).mockResolvedValue({
      familyId: "fam-1",
      role: "child",
      status: "approved",
    });

    await expect(assertParentCanRead("child-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("assertRole and the parent profile gate (ADR 0008)", () => {
  const user = { id: "user-1", email: "p@example.com" };

  beforeEach(() => {
    vi.mocked(auth.assertUser).mockResolvedValue(user);
    vi.mocked(repo.findMembership).mockResolvedValue(null);
  });

  it("refuses a parent whose profile is incomplete", async () => {
    vi.mocked(repo.findProfileRole).mockResolvedValue("parent");
    vi.mocked(profiles.isParentProfileComplete).mockResolvedValue(false);

    await expect(assertRole("parent")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Finish your profile first.",
    });
  });

  it("lets a parent with a complete profile through", async () => {
    vi.mocked(repo.findProfileRole).mockResolvedValue("parent");
    vi.mocked(profiles.isParentProfileComplete).mockResolvedValue(true);

    await expect(assertRole("parent")).resolves.toMatchObject({ user });
  });

  it("never checks the profile for a child", async () => {
    vi.mocked(repo.findProfileRole).mockResolvedValue("child");

    await expect(assertRole("child")).resolves.toMatchObject({ user });
    expect(profiles.isParentProfileComplete).not.toHaveBeenCalled();
  });
});
