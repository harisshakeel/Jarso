import { describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib";

vi.mock("server-only", () => ({}));

const { findProfileRole, registerChild, renameChildMember } = await import(
  "@/features/family/server/repository"
);

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
