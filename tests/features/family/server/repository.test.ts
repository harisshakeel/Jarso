import { describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib";

vi.mock("server-only", () => ({}));

const { advanceClock, fetchFamilyNow, findProfileRole, registerChild, renameChildMember } =
  await import("@/features/family/server/repository");

type Db = Parameters<typeof registerChild>[0];

function rpcFailing(code: string, message: string): Db {
  return { rpc: vi.fn(async () => ({ data: null, error: { code, message } })) } as unknown as Db;
}

const child = {
  childId: "c-1",
  familyId: "f-1",
  nickname: "Sam",
  pin: "1234",
  consent: true,
};

async function caught(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error("expected a rejection");
}

describe("registerChild / renameChildMember errors", () => {
  it("puts a taken nickname on the nickname field", async () => {
    const db = rpcFailing("JA409", "Nickname already used in this family");

    for (const call of [registerChild(db, child), renameChildMember(db, "c-1", "Sam")]) {
      const error = await caught(call);
      expect(error.code).toBe("CONFLICT");
      expect(error.fieldErrors?.nickname).toEqual([
        "Another child in your family already uses this nickname",
      ]);
    }
  });

  it("gives an unavailable child account its own message, not the nickname one", async () => {
    const error = await caught(
      registerChild(rpcFailing("JA409", "Child account is not available"), child),
    );

    expect(error.code).toBe("CONFLICT");
    expect(error.fieldErrors).toBeUndefined();
    expect(error.message).toBe("We couldn't set up this child account. Please try again.");
  });

  it("maps other database errors as usual", async () => {
    const error = await caught(
      registerChild(rpcFailing("JA403", "Parent consent is required"), child),
    );

    expect(error.code).toBe("FORBIDDEN");
    expect(error.fieldErrors).toBeUndefined();
  });
});

describe("findProfileRole", () => {
  function profileDb(row: { role: string } | null): Db {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return { from: () => query } as unknown as Db;
  }

  it("reads parent and child roles", async () => {
    expect(await findProfileRole(profileDb({ role: "parent" }), "u")).toBe("parent");
    expect(await findProfileRole(profileDb({ role: "child" }), "u")).toBe("child");
  });

  it("returns null for a missing profile or an unknown role", async () => {
    expect(await findProfileRole(profileDb(null), "u")).toBeNull();
    expect(await findProfileRole(profileDb({ role: "admin" }), "u")).toBeNull();
  });
});

describe("demo clock", () => {
  function rpcReturning(data: unknown): Db {
    return { rpc: vi.fn(async () => ({ data, error: null })) } as unknown as Db;
  }

  it("reads the family's now as a Date", async () => {
    const db = rpcReturning("2026-11-09T10:00:00+00:00");
    await expect(fetchFamilyNow(db, "f-1")).resolves.toEqual(new Date("2026-11-09T10:00:00Z"));
    expect(db.rpc).toHaveBeenCalledWith("family_now", { p_family_id: "f-1" });
  });

  it("maps a clock move to camelCase", async () => {
    const db = rpcReturning({ offset_days: 8, today: "2026-11-10", generated: 1, reminders: 4 });
    await expect(advanceClock(db, "f-1", 7)).resolves.toEqual({
      offsetDays: 8,
      today: "2026-11-10",
      generated: 1,
      reminders: 4,
    });
    expect(db.rpc).toHaveBeenCalledWith("advance_family_clock", { p_family_id: "f-1", p_days: 7 });
  });

  it("maps database refusals and an unexpected shape to safe errors", async () => {
    expect((await caught(advanceClock(rpcFailing("JA409", "off"), "f-1", 1))).code).toBe(
      "CONFLICT",
    );
    expect((await caught(advanceClock(rpcFailing("JA403", "no"), "f-1", 1))).code).toBe(
      "FORBIDDEN",
    );
    expect((await caught(advanceClock(rpcReturning({ today: 1 }), "f-1", 1))).code).toBe(
      "INTERNAL",
    );
  });
});
