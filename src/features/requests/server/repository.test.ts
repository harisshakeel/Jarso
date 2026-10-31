import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/types";
import { listRequestsFor } from "./repository";

type Row = {
  id: string;
  kind: string;
  status: string;
  amount_minor: number;
  reason: string | null;
  auto: boolean;
  occurred_at: string;
};

const row = (id: string, status: string, occurredAt: string): Row => ({
  id,
  kind: "withdrawal",
  status,
  amount_minor: 100,
  reason: null,
  auto: false,
  occurred_at: occurredAt,
});

/** A query builder that applies the filters listRequestsFor sets, over fixed rows. */
function fakeDb(rows: Row[], failOn?: "open" | "closed") {
  const from = () => {
    let statuses: string[] | null = null;
    let negate = false;
    let limit = Number.POSITIVE_INFINITY;
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: (_col: string, values: string[]) => {
        statuses = values;
        return builder;
      },
      not: (_col: string, _op: string, value: string) => {
        statuses = value.slice(1, -1).split(",");
        negate = true;
        return builder;
      },
      order: () => builder,
      limit: (n: number) => {
        limit = n;
        return builder;
      },
      // biome-ignore lint/suspicious/noThenProperty: the builder is awaited like a PostgREST query
      then: (resolve: (value: unknown) => void) => {
        if (failOn === (negate ? "closed" : "open")) {
          return resolve({ data: null, error: { message: "boom", code: "XX000" } });
        }
        const data = rows
          .filter((r) => !statuses || statuses.includes(r.status) !== negate)
          .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
          .slice(0, limit);
        return resolve({ data, error: null });
      },
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

describe("listRequestsFor", () => {
  it("keeps an old pending request behind more closed ones than the limit", async () => {
    const closed = Array.from({ length: 60 }, (_, i) =>
      row(`c${i}`, "confirmed", new Date(Date.UTC(2026, 9, 2, 0, i)).toISOString()),
    );
    const old = row("old-pending", "pending", "2026-10-01T00:00:00.000Z");
    const list = await listRequestsFor(fakeDb([old, ...closed]), "child-1");
    expect(list.map((r) => r.id)).toContain("old-pending");
    expect(list.filter((r) => r.status === "confirmed")).toHaveLength(50);
  });

  it("returns newest first across open and closed", async () => {
    const list = await listRequestsFor(
      fakeDb([
        row("a", "confirmed", "2026-10-01T00:00:00.000Z"),
        row("b", "approved", "2026-10-03T00:00:00.000Z"),
        row("c", "rejected", "2026-10-05T00:00:00.000Z"),
        row("d", "pending", "2026-10-04T00:00:00.5+00:00"),
      ]),
      "child-1",
    );
    expect(list.map((r) => r.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("throws when either read fails", async () => {
    await expect(listRequestsFor(fakeDb([], "open"), "c")).rejects.toBeDefined();
    await expect(listRequestsFor(fakeDb([], "closed"), "c")).rejects.toBeDefined();
  });
});
