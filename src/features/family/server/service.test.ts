import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";
import { hashSecret } from "../codes";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ kind: "admin" })) }));
vi.mock("@/features/notifications/server", () => ({ sendEmail: vi.fn() }));
vi.mock("./repository", () => ({
  findFamilyById: vi.fn(),
  findInvitationByHash: vi.fn(),
  hitRateLimit: vi.fn(),
  insertFamily: vi.fn(),
  insertInvitation: vi.fn(),
  listChildMembers: vi.fn(),
  registerChild: vi.fn(),
  updateChildPin: vi.fn(),
  verifyChildPin: vi.fn(),
}));
vi.mock("./child-auth", () => ({
  createChildAuthUser: vi.fn(),
  deleteChildAuthUser: vi.fn(),
  mintChildSession: vi.fn(),
}));
vi.mock("./dal", () => ({
  assertParentOf: vi.fn(),
  assertRole: vi.fn(),
  getMembership: vi.fn(),
}));

const { sendEmail } = await import("@/features/notifications/server");
const repo = await import("./repository");
const childAuth = await import("./child-auth");
const dal = await import("./dal");
const service = await import("./service");

const parent = { id: "parent-1", email: "p@example.com" };
const membership = { familyId: "fam-1", role: "parent" as const, status: "approved" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dal.assertRole).mockResolvedValue({ user: parent, membership });
  vi.mocked(repo.hitRateLimit).mockResolvedValue(true);
});

describe("addChild", () => {
  it("deletes the new auth user and rethrows CONFLICT when register_child rejects", async () => {
    vi.mocked(childAuth.createChildAuthUser).mockResolvedValue("child-1");
    vi.mocked(repo.registerChild).mockRejectedValue(
      new AppError("CONFLICT", "That already exists."),
    );

    await expect(
      service.addChild({ familyId: "fam-1", nickname: "Sam", pin: "1234" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(childAuth.deleteChildAuthUser).toHaveBeenCalledWith("child-1");
  });

  it("returns the child summary on success", async () => {
    vi.mocked(childAuth.createChildAuthUser).mockResolvedValue("child-1");
    vi.mocked(repo.registerChild).mockResolvedValue();

    await expect(
      service.addChild({ familyId: "fam-1", nickname: " Sam ", pin: "1234" }),
    ).resolves.toEqual({ id: "child-1", nickname: "Sam" });
    expect(childAuth.deleteChildAuthUser).not.toHaveBeenCalled();
  });
});

describe("startChildOnboarding", () => {
  const input = { nickname: "Sam", parentEmail: "Parent@Example.com" };

  it("returns link and code even when sendEmail throws", async () => {
    vi.mocked(repo.insertInvitation).mockResolvedValue("inv-1");
    vi.mocked(sendEmail).mockRejectedValue(new Error("smtp down"));

    const result = await service.startChildOnboarding(input, "1.2.3.4");

    expect(result.link).toMatch(/^http:\/\/localhost:3000\/invite\?token=[0-9a-f]{64}$/);
    expect(result.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const token = new URL(result.link).searchParams.get("token") ?? "";
    expect(repo.insertInvitation).toHaveBeenCalledWith(expect.anything(), {
      nickname: "Sam",
      parentEmail: "Parent@Example.com",
      tokenHash: await hashSecret(token),
      codeHash: await hashSecret(result.code),
    });
    expect(repo.hitRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "invite:ip:1.2.3.4",
      "1 hour",
      5,
    );
    expect(repo.hitRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "invite:email:parent@example.com",
      "1 day",
      3,
    );
  });

  it("throws RATE_LIMITED and creates no invitation when the limit is hit", async () => {
    vi.mocked(repo.hitRateLimit).mockResolvedValue(false);

    await expect(service.startChildOnboarding(input, "1.2.3.4")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(repo.insertInvitation).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("findInvitation", () => {
  it("tries the token hash, then the normalised code hash", async () => {
    vi.mocked(repo.findInvitationByHash)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "inv-1", nickname: "Sam" });

    await expect(service.findInvitation(" abcd-efgh ")).resolves.toEqual({
      id: "inv-1",
      nickname: "Sam",
    });
    expect(repo.findInvitationByHash).toHaveBeenLastCalledWith(
      expect.anything(),
      await hashSecret("ABCDEFGH"),
    );
    expect(repo.hitRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "invite-lookup:user:parent-1",
      "1 hour",
      10,
    );
  });

  it("throws RATE_LIMITED without looking anything up when the limit is hit", async () => {
    vi.mocked(repo.hitRateLimit).mockResolvedValue(false);

    await expect(service.findInvitation("abcdefgh")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(repo.findInvitationByHash).not.toHaveBeenCalled();
  });
});

describe("childSignIn", () => {
  const input = { familyCode: "abc-23x", nickname: "Sam", pin: "1234" };

  it("maps a locked PIN to RATE_LIMITED and never mints a session", async () => {
    vi.mocked(repo.verifyChildPin).mockResolvedValue({ status: "locked" });

    await expect(service.childSignIn(input, "1.2.3.4")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(childAuth.mintChildSession).not.toHaveBeenCalled();
  });

  it("maps a wrong PIN to UNAUTHORIZED and never mints a session", async () => {
    vi.mocked(repo.verifyChildPin).mockResolvedValue({ status: "invalid" });

    await expect(service.childSignIn(input, "1.2.3.4")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(childAuth.mintChildSession).not.toHaveBeenCalled();
  });

  it("checks IP and family-code limits before verifying the PIN", async () => {
    vi.mocked(repo.hitRateLimit).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(service.childSignIn(input, "1.2.3.4")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(repo.hitRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "pin:ip:1.2.3.4",
      "15 minutes",
      20,
    );
    expect(repo.hitRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "pin:family:ABC23X",
      "1 hour",
      30,
    );
    expect(repo.verifyChildPin).not.toHaveBeenCalled();
  });

  it("mints a session for the verified child", async () => {
    vi.mocked(repo.verifyChildPin).mockResolvedValue({ status: "ok", childId: "child-1" });

    await service.childSignIn(input, "1.2.3.4");

    expect(childAuth.mintChildSession).toHaveBeenCalledWith("child-1");
  });
});
