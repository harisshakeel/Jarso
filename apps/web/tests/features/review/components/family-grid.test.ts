import { describe, expect, it } from "vitest";
import { familyGrid } from "@/features/review/components/family-grid";

const rows = (areas: string) => areas.match(/"[^"]+"/g)?.map((row) => row.slice(1, -1).split(" "));

describe("familyGrid", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])(
    "leaves no hole and places every tile once for %i children",
    (n) => {
      for (const cols of [2, 3] as const) {
        const plan = familyGrid(n, cols);
        const grid = rows(plan.areas) ?? [];
        expect(plan.rows.split(" ")).toHaveLength(grid.length);
        expect(plan.rows.endsWith("1fr")).toBe(true);
        expect(grid.every((row) => row.length === cols)).toBe(true);
        const names = new Set(grid.flat());
        for (let i = 0; i < n; i++) expect(names.has(`c${i}`)).toBe(true);
        for (const tile of ["graph", "history", "week"]) expect(names.has(tile)).toBe(true);
      }
    },
  );

  it("puts one child's card over the history, beside the graph and the week, on three columns", () => {
    expect(rows(familyGrid(1, 3).areas)).toEqual([
      ["c0", "graph", "week"],
      ["history", "graph", "week"],
    ]);
  });

  it("fills the slot beside two cards with the week, running down beside the graph", () => {
    expect(rows(familyGrid(2, 3).areas)).toEqual([
      ["c0", "c1", "week"],
      ["graph", "graph", "week"],
      ["graph", "graph", "history"],
    ]);
  });

  it("gives a full row of cards the graph with history and week beside it", () => {
    expect(rows(familyGrid(2, 2).areas)).toEqual([
      ["c0", "c1"],
      ["graph", "history"],
      ["graph", "week"],
    ]);
  });
});
