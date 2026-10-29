import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ kind: "admin" })) }));
vi.mock("@/features/family/server", () => ({
  assertParentCanRead: vi.fn(),
  assertParentOf: vi.fn(),
  assertRole: vi.fn(),
  getFamily: vi.fn(),
}));
vi.mock("./config", () => ({
  getGuideProvider: vi.fn(),
  guideDailyBudgetCents: vi.fn(() => 1000),
  guideProviderName: vi.fn(() => "fake"),
}));
vi.mock("./repository", () => ({
  findConversation: vi.fn(),
  findGuideAccess: vi.fn(),
  hasAnyMessage: vi.fn(),
  hitRateLimit: vi.fn(),
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  rateMessage: vi.fn(),
  recordTurn: vi.fn(),
  setGuideAccess: vi.fn(),
  startConversation: vi.fn(),
  usageSince: vi.fn(),
}));

const family = await import("@/features/family/server");
const config = await import("./config");
const repo = await import("./repository");
const { createFakeProvider } = await import("./fake-provider");
const service = await import("./service");

const child = { id: "child-1", email: null };
const home = { entry: "home" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.assertRole).mockResolvedValue({ user: child as never, membership: null });
  vi.mocked(family.getFamily).mockResolvedValue({
    id: "fam-1",
    code: "ABC234",
    currency: "GBP",
    timezone: "Europe/London",
  });
  vi.mocked(config.getGuideProvider).mockReturnValue(createFakeProvider());
  vi.mocked(config.guideProviderName).mockReturnValue("fake");
  vi.mocked(repo.findGuideAccess).mockResolvedValue(true);
  vi.mocked(repo.hitRateLimit).mockResolvedValue(true);
  vi.mocked(repo.startConversation).mockResolvedValue("convo-1");
  vi.mocked(repo.recordTurn).mockResolvedValue("reply-1");
  vi.mocked(repo.usageSince).mockResolvedValue([]);
});

describe("askGuide", () => {
  it("answers, stores the turn with contact details removed, and links topics", async () => {
    const result = await service.askGuide({
      conversationId: null,
      context: home,
      text: "What is saving? call 07700 900123",
    });
    expect(result).toMatchObject({ conversationId: "convo-1", turnsLeft: 11 });
    expect(result.reply).toMatchObject({ role: "guide", route: "on_topic", messageId: "reply-1" });
    expect(result.reply.topics).toEqual([{ key: "saving-goal", title: "Saving toward a goal" }]);
    expect(repo.recordTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        childId: "child-1",
        childText: "What is saving? call [removed]",
        route: "on_topic",
      }),
    );
  });

  it("shows helplines for the family's country with a safety response", async () => {
    const result = await service.askGuide({
      conversationId: null,
      context: home,
      text: "someone hurt me",
    });
    expect(result.reply).toMatchObject({ route: "safety", role: "fixed_copy", messageId: null });
    expect(result.reply.helplines.map((h) => h.name)).toContain("Childline");
    expect(repo.recordTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ flagged: true }),
    );
  });

  it("is off unless the deployment and the parent both allow it", async () => {
    vi.mocked(config.getGuideProvider).mockReturnValueOnce(null);
    await expect(
      service.askGuide({ conversationId: null, context: home, text: "hi" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    vi.mocked(repo.findGuideAccess).mockResolvedValueOnce(false);
    await expect(
      service.askGuide({ conversationId: null, context: home, text: "hi" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(repo.startConversation).not.toHaveBeenCalled();
  });

  it("is children only", async () => {
    vi.mocked(family.assertRole).mockRejectedValueOnce(
      new AppError("FORBIDDEN", "You can't do that."),
    );
    await expect(
      service.askGuide({ conversationId: null, context: home, text: "hi" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses someone else's chat and a full one", async () => {
    vi.mocked(repo.findConversation).mockResolvedValueOnce({
      id: "convo-2",
      childId: "child-2",
      entry: "home",
      contextKey: "home",
      turns: 1,
      flagged: false,
      createdAt: "",
      lastMessageAt: "",
    });
    await expect(
      service.askGuide({ conversationId: "convo-2", context: home, text: "hi" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    vi.mocked(repo.findConversation).mockResolvedValueOnce({
      id: "convo-1",
      childId: "child-1",
      entry: "home",
      contextKey: "home",
      turns: 12,
      flagged: false,
      createdAt: "",
      lastMessageAt: "",
    });
    await expect(
      service.askGuide({ conversationId: "convo-1", context: home, text: "hi" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rate limits per minute and per day", async () => {
    vi.mocked(repo.hitRateLimit).mockResolvedValueOnce(false);
    await expect(
      service.askGuide({ conversationId: null, context: home, text: "hi" }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    vi.mocked(repo.hitRateLimit).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(
      service.askGuide({ conversationId: null, context: home, text: "hi" }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringContaining("today"),
    });
  });

  it("pauses with the break copy once the daily budget is spent, without calling Claude", async () => {
    const provider = { ...createFakeProvider(), name: "anthropic" as const, reply: vi.fn() };
    vi.mocked(config.getGuideProvider).mockReturnValue(provider);
    vi.mocked(repo.usageSince).mockResolvedValue([
      {
        model: "claude-opus-5-5",
        usage: {
          mainInput: 0,
          mainOutput: 600_000,
          mainCacheRead: 0,
          mainCacheWrite: 0,
          screenInput: 0,
          screenOutput: 0,
        },
      },
    ]);
    const result = await service.askGuide({
      conversationId: null,
      context: home,
      text: "my email is a@b.co",
    });
    expect(result.reply.route).toBe("unavailable");
    expect(provider.reply).not.toHaveBeenCalled();
    expect(repo.recordTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ childText: "my email is [removed]" }),
    );
  });

  it("builds context from content keys and rejects unknown ones before anything is stored", async () => {
    await expect(
      service.askGuide({
        conversationId: null,
        context: {
          entry: "step",
          source: "practice",
          missionKey: null,
          stepKey: "nope",
          phase: "main",
          wrongTries: 0,
        },
        text: "help",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.hitRateLimit).not.toHaveBeenCalled();
  });
});

describe("parent views", () => {
  it("hide a child's message that got a safety response", async () => {
    vi.mocked(repo.listConversations).mockResolvedValue([
      {
        id: "convo-1",
        childId: "child-1",
        entry: "home",
        contextKey: "home",
        turns: 2,
        flagged: true,
        createdAt: "2026-10-30T10:00:00Z",
        lastMessageAt: "2026-10-30T10:05:00Z",
      },
    ]);
    const message = (
      id: string,
      role: "child" | "guide" | "fixed_copy",
      text: string,
      route: string | null,
    ) => ({
      id,
      conversationId: "convo-1",
      role,
      text,
      route: route as never,
      flagged: route === "safety",
      rating: null,
      createdAt: "2026-10-30T10:00:00Z",
    });
    vi.mocked(repo.listMessages).mockResolvedValue([
      message("m1", "child", "something private happened", null),
      message("m2", "fixed_copy", "Thank you for telling me.", "safety"),
      message("m3", "child", "what is saving?", null),
      message("m4", "guide", "Keeping money for later.", "on_topic"),
    ]);
    const chats = await service.listGuideChats("child-1");
    expect(chats[0]?.preview).toBe("A safety response was shown. The message is private.");
    const transcript = await service.getGuideTranscript("child-1", "convo-1");
    expect(transcript?.messages.map((m) => m.text)).toEqual([
      "A safety response was shown. The message is private.",
      "Thank you for telling me.",
      "what is saving?",
      "Keeping money for later.",
    ]);
    expect(family.assertParentCanRead).toHaveBeenCalledWith("child-1");
  });

  it("only a parent of the child can switch the guide", async () => {
    vi.mocked(family.assertParentOf).mockRejectedValueOnce(
      new AppError("FORBIDDEN", "You can't do that."),
    );
    await expect(service.setGuideAccess("child-1", true)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(repo.setGuideAccess).not.toHaveBeenCalled();
  });
});
