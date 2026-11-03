import { getAvailability } from "@jarso/data/requests";
import type { Database } from "@jarso/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

/** A client whose rpc answers from fixed values, by function name. */
function fakeDb(availableSave: number, cap: number | null) {
  const rpc = (name: string) => {
    const data =
      name === "available_save" ? availableSave : name === "withdrawal_cap_remaining" ? cap : 0;
    return Promise.resolve({ data, error: null });
  };
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("getAvailability", () => {
  it("has no take-out limit without a cap", async () => {
    expect((await getAvailability(fakeDb(300, null), "c")).takeOutLimitMinor).toBeNull();
  });

  it("is available Save when the cap is higher", async () => {
    expect((await getAvailability(fakeDb(300, 500), "c")).takeOutLimitMinor).toBe(300);
  });

  it("is the cap left when it is lower", async () => {
    const result = await getAvailability(fakeDb(300, 200), "c");
    expect(result.takeOutLimitMinor).toBe(200);
    expect(result.availableSaveMinor).toBe(300);
  });
});
