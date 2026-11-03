import type { GuideReply, GuideTurnEvent } from "@jarso/core/guide";
import { guideCopy, guideUi } from "@jarso/core/guide";
import { offlineCopy } from "@jarso/core/offline";
import { getFamilyContext } from "@jarso/data/family";
import { deleteMemory, getMyTranscript, listMemories, rateMessage } from "@jarso/data/guide";
import { getJars } from "@jarso/data/ledger";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
  GuideBubble,
  GuideThread,
  JarsoChatScreen,
  MemoryList,
  parseGuideContext,
  StepHelp,
  useSendTurn,
} from "@/features/guide";
import { CurrentStepContext } from "@/features/learning";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: mockUser.id }),
}));
jest.mock("@jarso/data/guide", () => ({
  listMyChats: jest.fn().mockResolvedValue([]),
  getMyTranscript: jest.fn(),
  listMemories: jest.fn(),
  deleteMemory: jest.fn(),
  rateMessage: jest.fn(),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
let mockIds = 0;
const mockUser = { id: "child-1" };
jest.mock("expo-crypto", () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockIds).padStart(12, "0")}`,
}));

const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() };
const MESSAGE_ID = "55555555-5555-4555-8555-555555555555";
const CONVERSATION_ID = "66666666-6666-4666-8666-666666666666";
const fetchMock = jest.fn();

const reply = (over: Partial<GuideReply> = {}): GuideReply => ({
  messageId: MESSAGE_ID,
  rating: null,
  role: "guide",
  text: "You have £10 in Spend and £20 in Save.",
  route: "on_topic",
  topics: [],
  check: null,
  helplines: [],
  lookedAt: ["jars"],
  remembered: [],
  ...over,
});

/** A streamed NDJSON reply the test feeds one line at a time. */
function stream() {
  const waiting: ((result: { value?: Uint8Array; done: boolean }) => void)[] = [];
  const ready: { value?: Uint8Array; done: boolean }[] = [];
  const encoder = new TextEncoder();
  const push = (event: GuideTurnEvent | null) => {
    const next = event
      ? { value: encoder.encode(`${JSON.stringify(event)}\n`), done: false }
      : { done: true };
    const reader = waiting.shift();
    if (reader) reader(next);
    else ready.push(next);
  };
  const response = {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () => {
          const next = ready.shift();
          return next ? Promise.resolve(next) : new Promise((resolve) => waiting.push(resolve));
        },
      }),
    },
  };
  return { response, push };
}

const replied = (turnsLeft = 11): GuideTurnEvent => ({
  type: "reply",
  data: { conversationId: CONVERSATION_ID, reply: reply(), turnsLeft },
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const sentBody = (call: number) =>
  JSON.parse((fetchMock.mock.calls[call] as [string, { body: string }])[1].body) as {
    clientMessageId: string;
    text: string;
  };

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.id = "child-1";
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  (useRouter as jest.Mock).mockReturnValue(router);
  (apiFetch as jest.Mock).mockResolvedValue({ available: true, introNeeded: false });
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
});

async function askInThread(question: string) {
  const user = userEvent.setup();
  await render(wrap(<GuideThread context={{ entry: "home" }} introNeeded={false} />));
  await user.type(screen.getByLabelText(guideUi.questionLabel), question);
  await user.press(screen.getByRole("button", { name: guideUi.ask }));
  return user;
}

describe("guide", () => {
  it("question shows as sent while Jarso thinks", async () => {
    const turn = stream();
    fetchMock.mockResolvedValue(turn.response);
    await askInThread("Can I buy a ball?");
    // Sent the moment it goes, before any reply (the web GuideSheet bug is not copied).
    expect(await screen.findByLabelText("You: Can I buy a ball?")).toBeOnTheScreen();
    expect(screen.getByText(guideCopy.thinking)).toBeOnTheScreen();
    expect(screen.getByLabelText(guideUi.questionLabel)).toHaveDisplayValue("");

    await act(async () => {
      turn.push(replied());
    });
    expect(await screen.findByText(reply().text)).toBeOnTheScreen();
    expect(screen.getAllByLabelText("You: Can I buy a ball?")).toHaveLength(1);
    expect(screen.queryByText(guideCopy.thinking)).toBeNull();
  });

  it("status lines render then reply", async () => {
    const turn = stream();
    fetchMock.mockResolvedValue(turn.response);
    await askInThread("How much do I have?");
    await act(async () => {
      turn.push({ type: "status", text: guideCopy.phases.reading });
    });
    expect(await screen.findByText(guideCopy.phases.reading)).toBeOnTheScreen();
    await act(async () => {
      turn.push({ type: "status", text: guideCopy.status.get_jars });
    });
    expect(await screen.findByText(guideCopy.status.get_jars)).toBeOnTheScreen();
    expect(screen.queryByText(guideCopy.phases.reading)).toBeNull();
    await act(async () => {
      turn.push(replied());
    });
    expect(await screen.findByText(reply().text)).toBeOnTheScreen();
    expect(screen.getByText(guideUi.lookedAt("jars"))).toBeOnTheScreen();
    expect(screen.queryByText(guideCopy.status.get_jars)).toBeNull();
    // Streamed with the child's bearer, to the web's turns route.
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("http://127.0.0.1:3000/api/v1/guide/turns");
    expect(init.headers.authorization).toBe("Bearer test-token");
  });

  it("retry after timeout reuses clientMessageId", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const { result } = await renderHook(() => useSendTurn({ timeoutMs: 20 }));
    const input = { text: "Can I buy a ball?", conversationId: null, context: { entry: "home" } };
    const first = await result.current.send(input as never, () => {});
    expect(first).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.slow },
    });

    const turn = stream();
    fetchMock.mockResolvedValueOnce(turn.response);
    turn.push(replied());
    const second = await result.current.send(input as never, () => {});
    expect(second.ok).toBe(true);
    expect(sentBody(1).clientMessageId).toBe(sentBody(0).clientMessageId);

    const next = stream();
    fetchMock.mockResolvedValueOnce(next.response);
    next.push(replied());
    await result.current.send({ ...input, text: "And Save?" } as never, () => {});
    expect(sentBody(2).clientMessageId).not.toBe(sentBody(0).clientMessageId);
  });

  it("waits 52 s for a turn by default", async () => {
    const { TURN_TIMEOUT_MS } = jest.requireActual("@/features/guide/use-send-turn");
    expect(TURN_TIMEOUT_MS).toBe(52_000);
  });

  it("chat full shows the web wording", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      body: null,
      json: async () => ({ error: { code: "CONFLICT", message: guideCopy.chatFull } }),
    });
    const user = await askInThread("One more?");
    expect(await screen.findByText(guideCopy.chatFull)).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: guideCopy.newChat }));
    expect(screen.getByLabelText(guideUi.questionLabel)).toHaveDisplayValue("");
    expect(screen.queryByRole("button", { name: guideCopy.newChat })).toBeNull();
  });

  it("rating calls rateMessage", async () => {
    (rateMessage as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(wrap(<GuideBubble reply={reply()} />));
    await user.press(screen.getByRole("button", { name: guideUi.helpful }));
    await waitFor(() => expect(rateMessage).toHaveBeenCalledWith(supabase, MESSAGE_ID, 1));
    expect(screen.getByRole("button", { name: guideUi.helpful })).toBeSelected();
  });

  it("memory delete removes it", async () => {
    const memory = {
      id: "77777777-7777-4777-8777-777777777777",
      kind: "interest",
      text: "football",
      createdAt: "2026-11-01T10:00:00Z",
      expiresAt: "2027-11-01T10:00:00Z",
    };
    (listMemories as jest.Mock).mockResolvedValueOnce([memory]).mockResolvedValue([]);
    (deleteMemory as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(wrap(<MemoryList />));
    const forget = await screen.findByRole("button", {
      name: `${guideCopy.memories.forget}: football`,
    });
    await user.press(forget);
    expect(deleteMemory).toHaveBeenCalledWith(supabase, memory.id);
    expect(await screen.findByText(guideCopy.memories.empty)).toBeOnTheScreen();
    expect(screen.queryByText("football")).toBeNull();
  });

  it("a deep link to a chat while the guide is off goes Home", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ available: false, introNeeded: false });
    await render(wrap(<JarsoChatScreen conversationId="new" />));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/(child)/(tabs)"));
    expect(screen.queryByLabelText(guideUi.questionLabel)).toBeNull();
  });

  it("help me opens the guide sheet about the step, by key", async () => {
    const user = userEvent.setup();
    await render(
      <CurrentStepContext.Provider
        value={{
          source: "mission",
          missionKey: "whats-in-spend",
          stepKey: "whats-left",
          phase: "main",
          wrongTries: 1,
          answered: false,
          answer: null,
        }}
      >
        <StepHelp />
      </CurrentStepContext.Provider>,
    );
    await user.press(screen.getByRole("button", { name: guideUi.helpMe }));
    const [{ pathname, params }] = router.push.mock.calls[0] as [
      { pathname: string; params: { context: string } },
    ];
    expect(pathname).toBe("/(child)/guide-sheet");
    expect(parseGuideContext(params.context)).toEqual({
      entry: "step",
      source: "mission",
      missionKey: "whats-in-spend",
      stepKey: "whats-left",
      phase: "main",
      wrongTries: 1,
    });
    expect(parseGuideContext("{not json")).toBeNull();
    expect(
      parseGuideContext(JSON.stringify({ entry: "parent", childId: CONVERSATION_ID })),
    ).toBeNull();
  });

  it("a failed refetch of the guide state keeps an open chat on screen", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(
      <QueryClientProvider client={client}>
        <JarsoChatScreen conversationId="new" />
      </QueryClientProvider>,
    );
    expect(await screen.findByLabelText(guideUi.questionLabel)).toBeOnTheScreen();
    (apiFetch as jest.Mock).mockRejectedValue(new Error("network blip"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["guideState"] });
    });
    await waitFor(() =>
      expect(client.getQueryState(["guideState", "child-1"])?.status).toBe("error"),
    );
    // Let the gate re-render with the error before checking it stayed.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(guideUi.questionLabel)).toBeOnTheScreen();
  });

  it("a reopened chat waits for the family's currency before showing", async () => {
    let resolveFamily: (value: unknown) => void = () => {};
    (getFamilyContext as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveFamily = resolve;
      }),
    );
    (getMyTranscript as jest.Mock).mockResolvedValue({
      summary: { id: CONVERSATION_ID, turns: 1 },
      messages: [
        { id: "m-1", role: "child", text: "Hello", route: null, rating: null, lookedAt: [] },
      ],
    });
    await render(wrap(<JarsoChatScreen conversationId={CONVERSATION_ID} />));
    await waitFor(() => expect(getMyTranscript).toHaveBeenCalled());
    expect(screen.queryByLabelText("You: Hello")).toBeNull();
    await act(async () => {
      resolveFamily({ currency: "GBP", timezone: "Europe/London", today: "2026-11-03" });
    });
    expect(await screen.findByLabelText("You: Hello")).toBeOnTheScreen();
  });

  it("the intro is read once per child, not once per phone", async () => {
    const user = userEvent.setup();
    const first = await render(wrap(<GuideThread context={{ entry: "home" }} introNeeded />));
    await user.press(screen.getByRole("button", { name: guideCopy.introButton }));
    await first.unmount();
    await render(wrap(<GuideThread context={{ entry: "home" }} introNeeded />));
    expect(screen.queryByRole("button", { name: guideCopy.introButton })).toBeNull();
    await screen.unmount();

    mockUser.id = "child-2";
    await render(wrap(<GuideThread context={{ entry: "home" }} introNeeded />));
    expect(screen.getByRole("button", { name: guideCopy.introButton })).toBeOnTheScreen();
  });
});
