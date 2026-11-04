import {
  createFamilyWithFallback,
  listChildMembers,
  listInvitationsForCaller,
} from "@jarso/data/family";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const family = { id: "fam-1", code: "ABC234", currency: "GBP", timezone: "UTC" };
const rejected = { data: null, error: { code: "22023", message: "bad timezone" } };

describe("createFamilyWithFallback", () => {
  it("retries with UTC on 22023", async () => {
    const { db, rpc } = fakeClient({ families: ok(family) });
    rpc.mockResolvedValueOnce(rejected as never).mockResolvedValueOnce(ok("fam-1") as never);

    await expect(
      createFamilyWithFallback(db, { currency: "GBP", timezone: "America/Ciudad_Juarez" }),
    ).resolves.toEqual(family);
    expect(rpc).toHaveBeenNthCalledWith(1, "create_family", {
      p_currency: "GBP",
      p_timezone: "America/Ciudad_Juarez",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "create_family", {
      p_currency: "GBP",
      p_timezone: "UTC",
    });
  });

  it("other errors rethrow", async () => {
    const { db, rpc } = fakeClient(
      {},
      { create_family: { data: null, error: { code: "JA409", message: "already" } } },
    );
    await expect(
      createFamilyWithFallback(db, { currency: "GBP", timezone: "Europe/London" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails when the new family can't be read back", async () => {
    const { db } = fakeClient({}, { create_family: ok("fam-1") });
    await expect(
      createFamilyWithFallback(db, { currency: "GBP", timezone: "Europe/London" }),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("family reads", () => {
  it("lists approved children with their nicknames, a missing one as blank", async () => {
    const { db } = fakeClient({
      family_members: ok([
        { profile_id: "c1", created_at: "x", profile: { nickname: "Sam" } },
        { profile_id: "c2", created_at: "y", profile: null },
      ]),
    });
    await expect(listChildMembers(db, "fam-1")).resolves.toEqual([
      { id: "c1", nickname: "Sam" },
      { id: "c2", nickname: "" },
    ]);
  });

  it("maps the caller's pending invitations", async () => {
    const { db } = fakeClient(
      {},
      {
        list_my_invitations: ok([
          { id: "i1", nickname: "Sam", created_at: "2026-11-01", expires_at: "2026-11-08" },
        ]),
      },
    );
    await expect(listInvitationsForCaller(db)).resolves.toEqual([
      { id: "i1", nickname: "Sam", createdAt: "2026-11-01", expiresAt: "2026-11-08" },
    ]);
  });
});
