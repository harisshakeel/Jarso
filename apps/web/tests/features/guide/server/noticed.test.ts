import type { NoticedInput, NoticedPayload } from "@jarso/core/guide";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ listNoticedInputs: vi.fn(), recordNoticed: vi.fn() }));
const breaker = vi.hoisted(() => ({
  isOpen: vi.fn(() => false),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));
const budget = vi.hoisted(() => ({ budgetSpent: vi.fn(async () => false) }));
const config = vi.hoisted(() => ({ getGuideProvider: vi.fn() }));
const push = vi.hoisted(() => ({ pushAfterNotices: vi.fn() }));
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ kind: "admin" }) }));
vi.mock("@/features/guide/server/repository", () => repo);
vi.mock("@/features/guide/server/breaker", () => ({ guideBreaker: breaker }));
vi.mock("@/features/guide/server/budget", () => budget);
vi.mock("@/features/guide/server/config", () => config);
vi.mock("@/features/notifications/server", () => push);
vi.mock("@/lib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib")>()),
  logger: log,
}));

const { createFakeProvider } = await import("@/features/guide/server/fake-provider");
const { noticeChild, runGuideNoticed } = await import("@/features/guide/server/noticed");

const now = new Date("2026-11-08T17:00:00Z");

/** Sam, halfway to a £100 bike, nothing else to say. */
const input: NoticedInput = {
  today: "2026-11-08",
  allowances: [],
  goal: { id: "g1", name: "Bike", targetMinor: 10000, countedMinor: 5000 },
  spentLast7DaysMinor: 0,
  spent7DaysBeforeMinor: 0,
  lastMoveOn: "2026-11-07",
  sentKeys: [],
};

function row(overrides: Partial<NoticedInput> = {}, extra: Record<string, unknown> = {}) {
  return {
    childId: "child-1",
    nickname: "Sam",
    currency: "GBP",
    guideOn: true,
    lastNoticedAt: null,
    input: { ...input, ...overrides },
    ...extra,
  };
}

/** The fake provider, with a reworded line of our choosing. */
function provider(line: string | null, pass = true) {
  const fake = createFakeProvider();
  return {
    ...fake,
    wordNotice: vi.fn(async () => ({ line, usage: {} })),
    screenOutput: vi.fn(async () => ({
      pass,
      problem: pass ? "none" : "comments_on_money",
      usage: {},
    })),
  };
}

const sent = () =>
  repo.recordNoticed.mock.calls.at(-1)?.[1] as {
    childId: string;
    signalKey: string;
    child: NoticedPayload | null;
    parent: NoticedPayload | null;
  };

const FIXED_CHILD = "£50 of £100 counts toward it now. Steady saving adds up.";

beforeEach(() => {
  vi.clearAllMocks();
  repo.recordNoticed.mockResolvedValue(2);
  breaker.isOpen.mockReturnValue(false);
  budget.budgetSpent.mockResolvedValue(false);
});

describe("noticeChild", () => {
  it("sends the fixed lines, with figures in, when Jarso is off for the child", async () => {
    const claude = provider("Reworded {{goal.saved}} {{goal.price}}");
    const outcome = await noticeChild(
      { kind: "admin" } as never,
      row({}, { guideOn: false }) as never,
      claude,
      now,
    );
    expect(claude.wordNotice).not.toHaveBeenCalled();
    expect(sent()).toEqual({
      childId: "child-1",
      signalKey: "goal_quarter:g1:2",
      child: {
        signal: "goal_quarter",
        title: "Halfway to Bike",
        detail: FIXED_CHILD,
        open: "goal",
        worded: false,
      },
      parent: {
        signal: "goal_quarter",
        title: "Sam is halfway to Bike",
        detail: "£50 of £100 counts toward it.",
        open: "child",
        worded: false,
      },
    });
    expect(outcome).toEqual({ notices: 2, worded: false });
  });

  it("uses Claude's line when it keeps the refs and passes the output screen", async () => {
    const claude = provider("You have {{goal.saved}} of {{goal.price}} toward your bike now.");
    await noticeChild({ kind: "admin" } as never, row() as never, claude, now);
    // Claude sees the fixed line with its refs, never a figure, a name or the goal.
    expect(claude.wordNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        line: "{{goal.saved}} of {{goal.price}} counts toward it now. Steady saving adds up.",
      }),
    );
    expect(claude.screenOutput).toHaveBeenCalledWith(
      expect.objectContaining({ reply: "You have £50 of £100 toward your bike now." }),
    );
    expect(sent().child).toMatchObject({
      detail: "You have £50 of £100 toward your bike now.",
      worded: true,
    });
    expect(sent().parent?.worded).toBe(false);
    expect(breaker.recordSuccess).toHaveBeenCalled();
  });

  it.each([
    ["drops a ref", "You have {{goal.saved}} saved."],
    ["adds a ref", "{{goal.saved}} of {{goal.price}}, {{jars.save}} in Save."],
    ["writes no refs at all", "You have £50 of £100."],
    ["adds an exclamation mark", "{{goal.saved}} of {{goal.price}} done!"],
    ["runs too long", `{{goal.saved}} of {{goal.price}} ${"so ".repeat(60)}`],
    ["refuses", null],
  ])("keeps the fixed line when Claude's %s", async (_case, line) => {
    const claude = provider(line);
    await noticeChild({ kind: "admin" } as never, row() as never, claude, now);
    expect(claude.screenOutput).not.toHaveBeenCalled();
    expect(sent().child).toMatchObject({ detail: FIXED_CHILD, worded: false });
  });

  it("keeps the fixed line when the output screen holds the reworded one back", async () => {
    const claude = provider("{{goal.saved}} of {{goal.price}}, a lot.", false);
    await noticeChild({ kind: "admin" } as never, row() as never, claude, now);
    expect(sent().child).toMatchObject({ detail: FIXED_CHILD, worded: false });
  });

  it("keeps the fixed line and counts a failure when Claude is down", async () => {
    const claude = provider(null);
    claude.wordNotice.mockRejectedValueOnce(new Error("timeout"));
    await noticeChild({ kind: "admin" } as never, row() as never, claude, now);
    expect(breaker.recordFailure).toHaveBeenCalled();
    expect(sent().child).toMatchObject({ detail: FIXED_CHILD, worded: false });
  });

  it("tells a spending jump to the parents only, without Claude", async () => {
    const claude = provider("x");
    await noticeChild(
      { kind: "admin" } as never,
      row({ goal: null, spentLast7DaysMinor: 3000, spent7DaysBeforeMinor: 1000 }) as never,
      claude,
      now,
    );
    expect(claude.wordNotice).not.toHaveBeenCalled();
    expect(sent().child).toBeNull();
    expect(sent().parent).toMatchObject({
      signal: "spending_jump",
      detail: "£30 in the last 7 days, £10 in the 7 days before. Worth a chat.",
      open: "history",
    });
  });

  it("does nothing for a child with nothing new, or nudged in the last 6 days", async () => {
    const claude = provider("x");
    expect(
      await noticeChild({ kind: "admin" } as never, row({ goal: null }) as never, claude, now),
    ).toBeNull();
    expect(
      await noticeChild(
        { kind: "admin" } as never,
        row({}, { lastNoticedAt: "2026-11-03T17:00:00Z" }) as never,
        claude,
        now,
      ),
    ).toBeNull();
    expect(claude.wordNotice).not.toHaveBeenCalled();
    expect(repo.recordNoticed).not.toHaveBeenCalled();
  });

  it("reports nothing sent when the database already had this one", async () => {
    repo.recordNoticed.mockResolvedValueOnce(0);
    expect(
      await noticeChild(
        { kind: "admin" } as never,
        row({}, { guideOn: false }) as never,
        null,
        now,
      ),
    ).toBeNull();
  });
});

describe("runGuideNoticed", () => {
  it("nudges each child once, counts, and pushes the notices", async () => {
    config.getGuideProvider.mockReturnValue(provider("{{goal.saved}} of {{goal.price}} now."));
    repo.listNoticedInputs.mockResolvedValue([
      row(),
      row({ goal: null }, { childId: "child-2" }),
      row({}, { childId: "child-3", guideOn: false }),
    ]);
    const result = await runGuideNoticed({ budgetMs: 10_000, now });
    expect(repo.listNoticedInputs).toHaveBeenCalledWith({ kind: "admin" }, now.toISOString());
    expect(result).toEqual({
      children: 3,
      nudged: 2,
      notices: 4,
      worded: 1,
      quiet: 1,
      failed: 0,
      timedOut: false,
    });
    expect(push.pushAfterNotices).toHaveBeenCalledOnce();
    // Counts only: no child id, name or line in the log.
    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/child-1|Sam|Bike|£/);
  });

  it("sends fixed lines only when the budget is spent, the breaker is open or the guide is off", async () => {
    const claude = provider("{{goal.saved}} of {{goal.price}} now.");
    config.getGuideProvider.mockReturnValue({ ...claude, name: "anthropic" });
    repo.listNoticedInputs.mockResolvedValue([row()]);

    budget.budgetSpent.mockResolvedValueOnce(true);
    expect((await runGuideNoticed({ budgetMs: 10_000, now })).worded).toBe(0);

    breaker.isOpen.mockReturnValueOnce(true);
    expect((await runGuideNoticed({ budgetMs: 10_000, now })).worded).toBe(0);

    config.getGuideProvider.mockReturnValue(null);
    expect((await runGuideNoticed({ budgetMs: 10_000, now })).worded).toBe(0);
    expect(claude.wordNotice).not.toHaveBeenCalled();
  });

  it("keeps going past a child that fails, and stops starting children once out of time", async () => {
    config.getGuideProvider.mockReturnValue(null);
    repo.listNoticedInputs.mockResolvedValue([row(), row({}, { childId: "child-2" })]);
    repo.recordNoticed.mockRejectedValueOnce(new Error("db")).mockResolvedValueOnce(2);
    expect(await runGuideNoticed({ budgetMs: 10_000, now })).toMatchObject({
      nudged: 1,
      failed: 1,
    });

    expect(await runGuideNoticed({ budgetMs: 0, now })).toMatchObject({
      nudged: 0,
      timedOut: true,
    });
    expect(push.pushAfterNotices).toHaveBeenCalledOnce();
  });
});
