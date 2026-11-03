import type { Client } from "@jarso/data/ledger";
import { getJars } from "@jarso/data/ledger";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/ledger/repository", () => ({ fetchBalance: vi.fn() }));
const repo = await import("../../src/ledger/repository");

describe("getJars", () => {
  it("returns both confirmed balances", async () => {
    vi.mocked(repo.fetchBalance).mockImplementation(async (_db, _child, jar) =>
      jar === "spend" ? 300 : 200,
    );
    await expect(getJars({} as Client, "child-1")).resolves.toEqual({ spend: 300, save: 200 });
  });
});
