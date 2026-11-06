import { familyCardsCopy, parentPageCopy } from "@jarso/core/dashboard";
import type { Notice } from "@jarso/core/notifications";
import { inboxCopy, noticeText } from "@jarso/core/notifications";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import { fetchUnreadCount, listNotices, markRead } from "@jarso/data/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { ParentInboxScreen } from "@/features/parent";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "44444444-4444-4444-8444-444444444444" }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/notifications", () => ({
  ...jest.requireActual("@jarso/data/notifications"),
  listNotices: jest.fn(),
  fetchUnreadCount: jest.fn(),
  markRead: jest.fn(),
}));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
}));

const push = jest.fn();
const notice = (over: Partial<Notice> = {}): Notice => ({
  id: "n-1",
  kind: "deposit_requested",
  childId: "child-1",
  childName: "Sam",
  sourceType: "request",
  sourceId: "request-1",
  payload: { amount_minor: 500 },
  createdAt: new Date().toISOString(),
  read: false,
  ...over,
});

function setup(items: Notice[], unread = items.filter((n) => !n.read).length) {
  (useRouter as jest.Mock).mockReturnValue({ push });
  (findMembership as jest.Mock).mockResolvedValue({
    familyId: "family-1",
    role: "parent",
    status: "approved",
  });
  (findFamilyById as jest.Mock).mockResolvedValue({
    id: "family-1",
    code: "ABC123",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
  (listChildMembers as jest.Mock).mockResolvedValue([{ id: "child-1", nickname: "Sam" }]);
  (listNotices as jest.Mock).mockResolvedValue({ items, nextBefore: null });
  (fetchUnreadCount as jest.Mock).mockResolvedValue(unread);
  (markRead as jest.Mock).mockResolvedValue(1);
}

function renderInbox() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ParentInboxScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("ParentInboxScreen", () => {
  it("shows the parent's notices with the family currency", async () => {
    setup([notice()]);
    await renderInbox();
    expect(await screen.findByRole("header", { name: parentPageCopy.inbox })).toBeOnTheScreen();
    const { title } = noticeText(notice(), "parent", "INR");
    expect(await screen.findByText(title)).toBeOnTheScreen();
  });

  it("empty says Nothing new with a sleepy Jarso", async () => {
    setup([]);
    await renderInbox();
    expect(await screen.findByText(familyCardsCopy.inboxEmpty)).toBeOnTheScreen();
    expect(screen.getByText(familyCardsCopy.inboxEmptyLine)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: inboxCopy.markAll })).toBeNull();
  });

  it("mark all as read marks every notice", async () => {
    setup([notice()]);
    await renderInbox();
    await userEvent.setup().press(await screen.findByRole("button", { name: inboxCopy.markAll }));
    await waitFor(() => expect(markRead).toHaveBeenCalledWith({ id: "client" }, null));
  });

  it("the unread chip counts new notices", async () => {
    setup([notice(), notice({ id: "n-2" })], 2);
    await renderInbox();
    expect(await screen.findByText(familyCardsCopy.unread(2))).toBeOnTheScreen();
  });

  it("opening a notice goes to its page", async () => {
    setup([notice()]);
    await renderInbox();
    await userEvent.setup().press(await screen.findByTestId("notice-row"));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(markRead).toHaveBeenCalledWith({ id: "client" }, ["n-1"]);
  });
});
