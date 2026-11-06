import type { Notice } from "@jarso/core/notifications";
import { inboxCopy, kidInboxCopy, noticeText } from "@jarso/core/notifications";
import { getFamilyContext } from "@jarso/data/family";
import { getJars } from "@jarso/data/ledger";
import { fetchUnreadCount, listNotices, markRead } from "@jarso/data/notifications";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Text } from "react-native";
import { KidInboxScreen, useUnreadCount } from "@/features/news";
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

function Badge() {
  const unread = useUnreadCount().data;
  return <Text testID="badge">{String(unread ?? "")}</Text>;
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push, back: jest.fn() });
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (markRead as jest.Mock).mockResolvedValue(1);
});

describe("KidInboxScreen", () => {
  it("lists notices and ends with That's everything", async () => {
    (listNotices as jest.Mock).mockResolvedValue({ items: [notice()], nextBefore: null });
    (fetchUnreadCount as jest.Mock).mockResolvedValue(1);
    await render(wrap(<KidInboxScreen />));
    const { title } = noticeText(notice(), "child", "GBP");
    expect(await screen.findByRole("link", { name: new RegExp(title) })).toBeOnTheScreen();
    expect(screen.getByText(kidInboxCopy.allDone)).toBeOnTheScreen();
  });

  it("empty inbox shows sleepy Jarso and Nothing new yet", async () => {
    (listNotices as jest.Mock).mockResolvedValue({ items: [], nextBefore: null });
    (fetchUnreadCount as jest.Mock).mockResolvedValue(0);
    await render(wrap(<KidInboxScreen />));
    expect(await screen.findByText(kidInboxCopy.nothingNew)).toBeOnTheScreen();
    expect(screen.getByTestId("inbox-jarso", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(kidInboxCopy.allDone)).toBeNull();
  });

  it("mark all read clears unread", async () => {
    (listNotices as jest.Mock).mockResolvedValue({ items: [notice()], nextBefore: null });
    (fetchUnreadCount as jest.Mock).mockResolvedValueOnce(2).mockResolvedValue(0);
    await render(
      wrap(
        <>
          <Badge />
          <KidInboxScreen />
        </>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("2"));
    await userEvent.press(await screen.findByRole("button", { name: inboxCopy.markAll }));
    expect(screen.getByText(kidInboxCopy.markAll)).toBeOnTheScreen();
    expect(markRead).toHaveBeenCalledWith(supabase, null);
    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("0"));
  });

  it("opening a notice marks it read and routes", async () => {
    (listNotices as jest.Mock).mockResolvedValue({ items: [notice()], nextBefore: null });
    (fetchUnreadCount as jest.Mock).mockResolvedValue(1);
    await render(wrap(<KidInboxScreen />));
    const { title } = noticeText(notice(), "child", "GBP");
    await userEvent.press(await screen.findByRole("link", { name: new RegExp(title) }));
    expect(markRead).toHaveBeenCalledWith(supabase, ["n-1"]);
    expect(push).toHaveBeenCalledWith("/(child)/(tabs)/diary");
  });
});
