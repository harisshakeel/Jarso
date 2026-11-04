import {
  findParentDetails,
  findProfileById,
  updateProfileById,
  upsertParentDetails,
} from "@jarso/data/profiles";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const details = {
  date_of_birth: "1985-04-02",
  country: "GB",
  gender: "female",
  completed_at: "2026-10-01T10:00:00Z",
};

describe("findParentDetails", () => {
  it("maps a completed profile", async () => {
    const { db } = fakeClient({ parent_details: ok(details) });
    await expect(findParentDetails(db, "p1")).resolves.toEqual({
      dateOfBirth: "1985-04-02",
      country: "GB",
      gender: "female",
      completedAt: "2026-10-01T10:00:00Z",
    });
  });

  it("is null before completion", async () => {
    const { db } = fakeClient({ parent_details: ok(null) });
    await expect(findParentDetails(db, "p1")).resolves.toBeNull();
  });

  it("unlisted country → null", async () => {
    const { db } = fakeClient({ parent_details: ok({ ...details, country: "ZZ" }) });
    await expect(findParentDetails(db, "p1")).resolves.toBeNull();
  });

  it("unlisted gender → null", async () => {
    const { db } = fakeClient({ parent_details: ok({ ...details, gender: "other" }) });
    await expect(findParentDetails(db, "p1")).resolves.toBeNull();
  });
});

describe("profile rows", () => {
  const row = {
    id: "p1",
    full_name: "Asha",
    avatar_url: null,
    created_at: "2026-10-01T10:00:00Z",
  };

  it("maps a profile and returns null when missing", async () => {
    await expect(findProfileById(fakeClient({ profiles: ok(row) }).db, "p1")).resolves.toEqual({
      id: "p1",
      fullName: "Asha",
      avatarUrl: null,
      createdAt: "2026-10-01T10:00:00Z",
    });
    await expect(findProfileById(fakeClient().db, "p1")).resolves.toBeNull();
  });

  it("updates the caller's row and returns it", async () => {
    const { db, queries } = fakeClient({ profiles: ok({ ...row, full_name: "Asha K" }) });
    await expect(updateProfileById(db, "p1", { full_name: "Asha K" })).resolves.toMatchObject({
      fullName: "Asha K",
    });
    expect(queries[0]?.calls).toContainEqual(["update", { full_name: "Asha K" }]);
    expect(queries[0]?.calls).toContainEqual(["eq", "id", "p1"]);
  });

  it("records details through complete_parent_profile", async () => {
    const { db, rpc } = fakeClient();
    await upsertParentDetails(db, { dateOfBirth: "1985-04-02", country: "GB", gender: "male" });
    expect(rpc).toHaveBeenCalledWith("complete_parent_profile", {
      p_date_of_birth: "1985-04-02",
      p_country: "GB",
      p_gender: "male",
    });
  });
});
