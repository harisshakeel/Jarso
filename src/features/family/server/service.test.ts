import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";
import { hashSecret } from "../codes";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ kind: "admin" })) }));
vi.mock("@/features/notifications/server", () => ({ sendEmail: vi.fn() }));
vi.mock("./repository", () => ({
  findFamilyById: vi.fn(),
  findInvitationByHash: vi.fn(),
  findNickname: vi.fn(),
  hitRateLimit: vi.fn(),
  insertFamily: vi.fn(),
  insertInvitation: vi.fn(),
  listChildMembers: vi.fn(),
  registerChild: vi.fn(),
  revokeUserSessions: vi.fn(),
  updateChildPin: vi.fn(),
  verifyChildPin: vi.fn(),
}));
vi.mock("./child-auth", () => ({
  createChildAuthUser: vi.fn(),
  deleteChildAuthUser: vi.fn(),
  mintChildSession: vi.fn(),
  rotateChildPassword: vi.fn(),
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
const ipHash = await hashSecret("1.2.3.4");
const membership = { familyId: "fam-1", role: "parent" as const, status: "approved" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dal.assertRole).mockResolvedValue({ user: parent, membership });
  vi.mocked(repo.hitRateLimit).mockResolvedValue(true);
  vi.mocked(dal.assertParentOf).mockResolvedValue(parent);
  vi.mocked(repo.updateChildPin).mockResolvedValue();
});

describe("addChild", () => {
  it("deletes the new auth user and rethrows CONFLICT when register_child rejects", async () => {
    vi.mocked(childAuth.createChildAuthUser).mockResolvedValue("child-1");
    vi.mocked(repo.registerChild).mockRejectedValue(
      new AppError("CONFLICT", "That already exists."),
    );

    await expect(
      service.addChild({ familyId: "fam-1", nickname: "Sam", pin: "1234", consent: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(childAuth.deleteChildAuthUser).toHaveBeenCalledWith("child-1");
  });

  it("returns the child summary on success and passes consent to register_child", async () => {
    vi.mocked(childAuth.createChildAuthUser).mockResolvedValue("child-1");
    vi.mocked(repo.registerChild).mockResolvedValue();

    await expect(
      service.addChild({ familyId: "fam-1", nickname: " Sam ", pin: "1234", consent: true }),
    ).resolves.toEqual({ id: "child-1", nickname: "Sam" });
    expect(childAuth.deleteChildAuthUser).not.toHaveBeenCalled();
    expect(repo.registerChild).toHaveBeenCalledWith(expect.anything(), {
      childId: "child-1",
      familyId: "fam-1",
      nickname: " Sam ",
      pin: "1234",
      consent: true,
    });
  });

  it("passes consent false through unchanged (the database rejects it)", async () => {
    vi.mocked(childAuth.createChildAuthUser).mockResolvedValue("child-1");
    vi.mocked(repo.registerChild).mockRejectedValue(new AppError("FORBIDDEN", "No consent."));

    await expect(
      service.addChild({ familyId: "fam-1", nickname: "Sam", pin: "1234", consent: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.registerChild).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ consent: false }),
    );
    expect(childAuth.deleteChildAuthUser).toHaveBeenCalledWith("child-1");
  });
});

describe("createFamily", () => {
  it("falls back to UTC when the database rejects the device timezone", async () => {
    vi.mocked(repo.insertFamily)
      .mockRejectedValueOnce(new AppError("VALIDATION", "Please check what you entered."))
      .mockResolvedValueOnce("fam-1");
    const family = { id: "fam-1", code: "ABC234", currency: "GBP", timezone: "UTC" };
    vi.mocked(repo.findFamilyById).mockResolvedValue(family);

    await expect(
      service.createFamily({ currency: "GBP", timezone: "America/Ciudad_Juarez" }),
    ).resolves.toEqual(family);
    expect(repo.insertFamily).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "GBP",
      "America/Ciudad_Juarez",
    );
    expect(repo.insertFamily).toHaveBeenNthCalledWith(2, expect.anything(), "GBP", "UTC");
  });

  it("does not retry other errors", async () => {
    vi.mocked(repo.insertFamily).mockRejectedValue(new AppError("CONFLICT", "Already in a family"));

    await expect(
      service.createFamily({ currency: "GBP", timezone: "Europe/London" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.insertFamily).toHaveBeenCalledTimes(1);
  });
});

describe("acceptInvitation", () => {
  const input = { invite: "ABCD2345", pin: "1234", consent: true };

  it("registers the child with the invitation id, its nickname and consent", async () => {
    vi.mocked(repo.findInvitationByHash).mockResolvedValue({ id: "inv-1", nickname: "Sam" });
    vi.mocked(childAuth.createChildAuthUser).mockResolvedValue("child-1");
    vi.mocked(repo.registerChild).mockResolvedValue();

    await expect(service.acceptInvitation(input)).resolves.toEqual({
      id: "child-1",
      nickname: "Sam",
    });
    expect(repo.registerChild).toHaveBeenCalledWith(expect.anything(), {
      childId: "child-1",
      familyId: "fam-1",
      nickname: "Sam",
      pin: "1234",
      consent: true,
      invitationId: "inv-1",
    });
  });

  it("prefers the nickname the parent typed", async () => {
    vi.mocked(repo.findInvitationByHash).mockResolvedValue({ id: "inv-1", nickname: "Sam" });
    vi.mocked(childAuth.createChildAuthUser).mockResolvedValue("child-1");
    vi.mocked(repo.registerChild).mockResolvedValue();

    await service.acceptInvitation({ ...input, nickname: "Sammy" });
    expect(repo.registerChild).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nickname: "Sammy" }),
    );
  });

  it("throws NOT_FOUND and creates no child for an unknown invitation", async () => {
    vi.mocked(repo.findInvitationByHash).mockResolvedValue(null);

    await expect(service.acceptInvitation(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(childAuth.createChildAuthUser).not.toHaveBeenCalled();
  });

  it("shows INVITATION_GONE when a concurrent accept used the invitation first", async () => {
    vi.mocked(repo.findInvitationByHash).mockResolvedValue({ id: "inv-1", nickname: "Sam" });
    vi.mocked(childAuth.createChildAuthUser).mockResolvedValue("child-1");
    vi.mocked(repo.registerChild).mockRejectedValue(
      new AppError("NOT_FOUND", "We couldn't find that."),
    );

    await expect(service.acceptInvitation(input)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: service.INVITATION_GONE,
    });
    expect(childAuth.deleteChildAuthUser).toHaveBeenCalledWith("child-1");
  });

  it("throws FORBIDDEN for a parent without a family", async () => {
    vi.mocked(dal.assertRole).mockResolvedValue({ user: parent, membership: null });

    await expect(service.acceptInvitation(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.findInvitationByHash).not.toHaveBeenCalled();
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
    expect(vi.mocked(repo.hitRateLimit).mock.calls.map((call) => call.slice(1))).toEqual([
      [`invite:ip:${ipHash}`, "1 hour", 5],
      [`invite:email:${await hashSecret("parent@example.com")}`, "1 day", 3],
      ["invite:global", "1 day", 200],
    ]);
  });

  it("never puts the raw IP or email in a limiter key", async () => {
    vi.mocked(repo.insertInvitation).mockResolvedValue("inv-1");

    await service.startChildOnboarding(input, "1.2.3.4");

    const keys = vi
      .mocked(repo.hitRateLimit)
      .mock.calls.map((call) => call[1])
      .join(" ");
    expect(keys).not.toMatch(/1\.2\.3\.4|example\.com/i);
  });

  it("counts plus-addressed variants of one inbox together", async () => {
    vi.mocked(repo.insertInvitation).mockResolvedValue("inv-1");

    await service.startChildOnboarding({ ...input, parentEmail: "Parent+kid1@Example.com" }, "1");

    expect(repo.hitRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      `invite:email:${await hashSecret("parent@example.com")}`,
      "1 day",
      3,
    );
  });

  it("uses a fixed subject; the nickname appears only in the body", async () => {
    vi.mocked(repo.insertInvitation).mockResolvedValue("inv-1");
    vi.mocked(sendEmail).mockResolvedValue("sent");

    await service.startChildOnboarding({ ...input, nickname: "Zed" }, "1.2.3.4");

    const message = vi.mocked(sendEmail).mock.calls[0]?.[0];
    expect(message?.subject).toBe("Your child wants to join Jarso");
    expect(message?.text).toContain("Zed");
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
      { kind: "admin" },
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

  it("refuses non-parents before any lookup", async () => {
    vi.mocked(dal.assertRole).mockRejectedValue(new AppError("FORBIDDEN", "You can't do that."));

    await expect(service.findInvitation("abcdefgh")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.hitRateLimit).not.toHaveBeenCalled();
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
      `pin:ip:${ipHash}`,
      "15 minutes",
      20,
    );
    expect(repo.hitRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      `pin:family:ABC23X:${ipHash}`,
      "1 hour",
      30,
    );
    expect(repo.verifyChildPin).not.toHaveBeenCalled();
  });

  it("checks the PIN against this source's lockout (hashed IP)", async () => {
    vi.mocked(repo.verifyChildPin).mockResolvedValue({ status: "invalid" });

    await expect(service.childSignIn(input, "1.2.3.4")).rejects.toThrow();
    expect(repo.verifyChildPin).toHaveBeenCalledWith(
      expect.anything(),
      "ABC23X",
      "Sam",
      "1234",
      ipHash,
    );
  });

  it("rotates the child's password, then mints a session", async () => {
    vi.mocked(repo.verifyChildPin).mockResolvedValue({ status: "ok", childId: "child-1" });

    await service.childSignIn(input, "1.2.3.4");

    expect(childAuth.rotateChildPassword).toHaveBeenCalledWith("child-1");
    expect(childAuth.mintChildSession).toHaveBeenCalledWith("child-1");
    expect(
      vi.mocked(childAuth.rotateChildPassword).mock.invocationCallOrder[0] ?? Infinity,
    ).toBeLessThan(vi.mocked(childAuth.mintChildSession).mock.invocationCallOrder[0] ?? 0);
  });
});

describe("setChildPin", () => {
  const input = { childId: crypto.randomUUID(), pin: "4321" };

  it("sets the PIN, rotates the password and revokes every session", async () => {
    await service.setChildPin(input);

    expect(repo.updateChildPin).toHaveBeenCalledWith({ kind: "user" }, input.childId, "4321");
    expect(childAuth.rotateChildPassword).toHaveBeenCalledWith(input.childId);
    expect(repo.revokeUserSessions).toHaveBeenCalledWith({ kind: "admin" }, input.childId);
  });

  it("touches nothing when the caller is not the child's parent", async () => {
    vi.mocked(dal.assertParentOf).mockRejectedValue(new AppError("FORBIDDEN", "No."));

    await expect(service.setChildPin(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repo.updateChildPin).not.toHaveBeenCalled();
    expect(childAuth.rotateChildPassword).not.toHaveBeenCalled();
    expect(repo.revokeUserSessions).not.toHaveBeenCalled();
  });

  it("does not revoke sessions when the PIN update fails", async () => {
    vi.mocked(repo.updateChildPin).mockRejectedValue(new AppError("VALIDATION", "Bad PIN"));

    await expect(service.setChildPin(input)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(repo.revokeUserSessions).not.toHaveBeenCalled();
  });
});
