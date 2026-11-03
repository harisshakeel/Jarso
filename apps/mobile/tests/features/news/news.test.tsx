import type { Notice } from "@jarso/core/notifications";
import { inboxCopy, noticeText } from "@jarso/core/notifications";
import { getFamilyContext } from "@jarso/data/family";
import { getJars } from "@jarso/data/ledger";
import { fetchUnreadCount, listNotices, markRead } from "@jarso/data/notifications";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { AppState, type AppStateStatus, Text } from "react-native";
import {
  NewsScreen,
  NoticeListener,
  noticeTargetRoute,
  useOpenNotice,
  useUnreadCount,
} from "@/features/news";
import { supabase } from "@/lib/supabase/client";

type Handler = (event: { eventType: string; new?: unknown }) => void;
const mockHandlers: Handler[] = [];
type MockChannel = { on: jest.Mock; subscribe: jest.Mock };
const mockChannel: MockChannel = {
  on: jest.fn((_event: string, _filter: unknown, handler: Handler): MockChannel => {
    mockHandlers.push(handler);
    return mockChannel;
  }),
  subscribe: jest.fn((onStatus: (status: string) => void): MockChannel => {
    onStatus("SUBSCRIBED");
    return mockChannel;
  }),
};

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn().mockResolvedValue("ok"),
    realtime: { setAuth: jest.fn().mockResolvedValue(undefined) },
  },
}));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/notifications", () => ({
  ...jest.requireActual("@jarso/data/notifications"),
  listNotices: jest.fn(),
  fetchUnreadCount: jest.fn(),
  markRead: jest.fn(),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));

const push = jest.fn();
const now = new Date().toISOString();
const notice = (over: Partial<Notice> = {}): Notice => ({
  id: "n-1",
  kind: "jar_moved",
  childId: "child-1",
  childName: "",
  sourceType: "ledger_entry",
  sourceId: "entry-1",
  payload: { direction: "spend_to_save", amount_minor: 500 },
  createdAt: now,
  read: false,
  ...over,
});

/** The News tab's badge, as the tabs layout reads it. */
function Badge() {
  const unread = useUnreadCount().data;
  return <Text testID="badge">{String(unread ?? "")}</Text>;
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

let appListener: ((state: AppStateStatus) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push, back: jest.fn() });
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (markRead as jest.Mock).mockResolvedValue(1);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

describe("news", () => {
  it("mark all read clears badge", async () => {
    (listNotices as jest.Mock).mockResolvedValue({ items: [notice()], nextBefore: null });
    (fetchUnreadCount as jest.Mock).mockResolvedValueOnce(2).mockResolvedValue(0);
    const user = userEvent.setup();
    await render(
      wrap(
        <>
          <Badge />
          <NewsScreen viewer="child" />
        </>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("2"));
    await user.press(await screen.findByRole("button", { name: inboxCopy.markAll }));
    expect(markRead).toHaveBeenCalledWith(supabase, null);
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("0"));
  });

  it("opening a notice marks it read and routes by noticeTarget", async () => {
    (listNotices as jest.Mock).mockResolvedValue({ items: [notice()], nextBefore: null });
    (fetchUnreadCount as jest.Mock).mockResolvedValue(1);
    const user = userEvent.setup();
    await render(wrap(<NewsScreen viewer="child" />));
    const { title } = noticeText(notice(), "child", "GBP");
    await user.press(await screen.findByRole("link", { name: new RegExp(title) }));
    expect(markRead).toHaveBeenCalledWith(supabase, ["n-1"]);
    expect(push).toHaveBeenCalledWith("/(child)/(tabs)/diary");
  });

  it("asks for the next page before the last notice", async () => {
    (listNotices as jest.Mock)
      .mockResolvedValueOnce({ items: [notice()], nextBefore: `${now}|n-1` })
      .mockResolvedValue({ items: [notice({ id: "n-2", read: true })], nextBefore: null });
    (fetchUnreadCount as jest.Mock).mockResolvedValue(1);
    const user = userEvent.setup();
    await render(wrap(<NewsScreen viewer="child" />));
    await user.press(await screen.findByRole("button", { name: inboxCopy.showMore }));
    await waitFor(() =>
      expect(listNotices).toHaveBeenLastCalledWith(supabase, "child-1", {
        before: `${now}|n-1`,
        limit: 20,
      }),
    );
    expect(listNotices).toHaveBeenNthCalledWith(1, supabase, "child-1", {
      before: undefined,
      limit: 20,
    });
  });

  it("realtime insert shows toast and bumps badge", async () => {
    (fetchUnreadCount as jest.Mock).mockResolvedValueOnce(0).mockResolvedValue(1);
    const user = userEvent.setup();
    await render(
      wrap(
        <>
          <Badge />
          <NoticeListener userId="child-1" viewer="child" />
        </>,
      ),
    );
    await waitFor(() => expect(mockChannel.subscribe).toHaveBeenCalled());
    expect(supabase.channel).toHaveBeenCalledWith(expect.stringMatching(/^notices:child-1:/));
    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: "recipient_id=eq.child-1" },
      expect.any(Function),
    );
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent(/^[01]$/));

    const row = {
      id: "n-9",
      kind: "jar_moved",
      child_id: "child-1",
      recipient_id: "child-1",
      source_type: "ledger_entry",
      source_id: "entry-9",
      payload: { direction: "spend_to_save", amount_minor: 500 },
      created_at: now,
      read_at: null,
    };
    await act(async () => mockHandlers[0]?.({ eventType: "INSERT", new: row }));
    const { title } = noticeText(notice({ id: "n-9" }), "child", "GBP");
    expect(await screen.findByText(title)).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("1"));

    await user.press(screen.getByRole("button", { name: `${title}. ${inboxCopy.open}` }));
    expect(push).toHaveBeenCalledWith("/(child)/(tabs)/news");
  });

  it("foreground resubscribes and refetches unread", async () => {
    (fetchUnreadCount as jest.Mock).mockResolvedValue(0);
    await render(
      wrap(
        <>
          <Badge />
          <NoticeListener userId="child-1" viewer="child" />
        </>,
      ),
    );
    await waitFor(() => expect(mockChannel.subscribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("0"));
    const reads = (fetchUnreadCount as jest.Mock).mock.calls.length;

    await act(async () => appListener?.("background"));
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);

    (fetchUnreadCount as jest.Mock).mockResolvedValue(4);
    await act(async () => appListener?.("active"));
    await waitFor(() => expect(mockChannel.subscribe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("4"));
    expect((fetchUnreadCount as jest.Mock).mock.calls.length).toBeGreaterThan(reads);
  });

  it("coming back to the front refetches even before the channel rejoins", async () => {
    (fetchUnreadCount as jest.Mock).mockResolvedValue(0);
    await render(
      wrap(
        <>
          <Badge />
          <NoticeListener userId="child-1" viewer="child" />
        </>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("0"));
    await act(async () => appListener?.("background"));
    // The rejoin never reports SUBSCRIBED (a slow socket): the badge must still catch up.
    mockChannel.subscribe.mockImplementationOnce(() => mockChannel);
    (fetchUnreadCount as jest.Mock).mockResolvedValue(3);
    await act(async () => appListener?.("active"));
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("3"));
  });

  it("a parent's toast opens the parent inbox", async () => {
    (fetchUnreadCount as jest.Mock).mockResolvedValue(1);
    const user = userEvent.setup();
    await render(wrap(<NoticeListener userId="child-1" viewer="parent" />));
    await waitFor(() => expect(mockChannel.subscribe).toHaveBeenCalled());
    const row = {
      id: "n-9",
      kind: "withdrawal_requested",
      child_id: "child-1",
      recipient_id: "child-1",
      source_type: "request",
      source_id: "req-9",
      payload: { amount_minor: 500 },
      created_at: now,
      read_at: null,
    };
    await act(async () => mockHandlers[0]?.({ eventType: "INSERT", new: row }));
    const { title } = noticeText(
      notice({
        id: "n-9",
        kind: "withdrawal_requested",
        sourceType: "request",
        sourceId: "req-9",
        payload: { amount_minor: 500 },
      }),
      "parent",
      "GBP",
    );
    await user.press(await screen.findByRole("button", { name: `${title}. ${inboxCopy.open}` }));
    expect(push).toHaveBeenCalledWith("/(parent)/(tabs)/inbox");
  });
});

describe("noticeTargetRoute", () => {
  it("noticeTargetRoute parent handover target", () => {
    expect(
      noticeTargetRoute({ to: "handover", childId: "c-1", kind: "gift", id: "g-1" }, "parent"),
    ).toBe("/(parent)/children/c-1/handover/gift/g-1");
  });

  it("noticeTargetRoute parent child target", () => {
    expect(noticeTargetRoute({ to: "child", childId: "c-1" }, "parent")).toBe(
      "/(parent)/children/c-1",
    );
  });

  it("noticeTargetRoute parent child-history target", () => {
    expect(noticeTargetRoute({ to: "child-history", childId: "c-1" }, "parent")).toBe(
      "/(parent)/children/c-1/history",
    );
  });

  it("noticeTargetRoute parent home target", () => {
    expect(noticeTargetRoute({ to: "home" }, "parent")).toBe("/(parent)/(tabs)");
  });

  it("child mapping unchanged", () => {
    expect(noticeTargetRoute({ to: "diary" }, "child")).toBe("/(child)/(tabs)/diary");
    expect(noticeTargetRoute({ to: "goal" }, "child")).toBe("/(child)/goal");
    expect(noticeTargetRoute({ to: "jarso" }, "child")).toBe("/(child)/(tabs)/jarso");
    expect(noticeTargetRoute({ to: "home" }, "child")).toBe("/(child)/(tabs)");
    // Parent records never reach a child; Home is the safe place.
    expect(noticeTargetRoute({ to: "child", childId: "c-1" }, "child")).toBe("/(child)/(tabs)");
    expect(
      noticeTargetRoute({ to: "handover", childId: "c-1", kind: "gift", id: "g-1" }, "child"),
    ).toBe("/(child)/(tabs)");
  });

  it('useOpenNotice("parent") marks read and routes', async () => {
    const { result } = await renderHook(() => useOpenNotice("parent"), {
      wrapper: ({ children }) => wrap(children),
    });
    await act(async () =>
      result.current(
        notice({ kind: "allowance_due", sourceType: "allowance_occurrence", sourceId: "occ-1" }),
      ),
    );
    expect(markRead).toHaveBeenCalledWith(supabase, ["n-1"]);
    expect(push).toHaveBeenCalledWith("/(parent)/children/child-1/handover/allowance/occ-1");
  });
});
