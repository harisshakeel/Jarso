import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = { createUser: vi.fn(), deleteUser: vi.fn() };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ auth: { admin } })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { createChildAuthUser } = await import("@/features/family/server/child-auth");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createChildAuthUser", () => {
  it("returns the id it created the user with", async () => {
    admin.createUser.mockResolvedValue({ data: {}, error: null });

    const id = await createChildAuthUser();

    expect(admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ id }));
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the chosen id best-effort when createUser errors, then throws", async () => {
    admin.createUser.mockResolvedValue({ data: null, error: { status: 504, code: "timeout" } });
    admin.deleteUser.mockResolvedValue({ data: null, error: { status: 404 } });

    await expect(createChildAuthUser()).rejects.toMatchObject({ code: "INTERNAL" });
    const id = admin.createUser.mock.calls[0]?.[0].id;
    expect(admin.deleteUser).toHaveBeenCalledWith(id);
  });

  it("still throws the creation error when the cleanup itself fails", async () => {
    admin.createUser.mockResolvedValue({ data: null, error: { status: 500, code: "x" } });
    admin.deleteUser.mockRejectedValue(new Error("network"));

    await expect(createChildAuthUser()).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
