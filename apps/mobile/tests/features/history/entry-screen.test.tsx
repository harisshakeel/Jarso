import { diaryCopy, entryDetailCopy } from "@jarso/core/diary";
import type { HistoryItem } from "@jarso/core/ledger";
import { AppError } from "@jarso/core/lib";
import { callCorrectDiaryEntry } from "@jarso/data/diary";
import { getFamilyContext } from "@jarso/data/family";
import { getHistoryPage, getJars } from "@jarso/data/ledger";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EntryRoute } from "@/features/history";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/diary", () => ({
  callCorrectDiaryEntry: jest.fn(),
  callListEntryVersions: jest.fn(),
  undoEntry: jest.fn(),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn(), getHistoryPage: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return { SafeAreaView: View };
});
jest.mock("expo-router", () => ({ useRouter: jest.fn(), useLocalSearchParams: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "33333333-3333-4333-8333-333333333333" }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const ENTRY = "44444444-4444-4444-8444-444444444444";
const back = jest.fn();
const page = getHistoryPage as jest.Mock;

const line: HistoryItem = {
  id: "row-1",
  kind: "purchase",
  amountMinor: 500,
  dueMinor: null,
  label: "Crisps",
  occurredOn: "2026-11-03",
  undone: false,
  entryId: ENTRY,
  canUndo: false,
  paidByCard: false,
  category: "snacks",
  jar: "spend",
  canFix: true,
  fixedFrom: null,
};

async function renderRoute() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <EntryRoute />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ back, canGoBack: () => true, replace: jest.fn() });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ entryId: ENTRY });
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 0 });
  (getAvailability as jest.Mock).mockResolvedValue({});
});

describe("entry route", () => {
  it("keeps showing Fixed after the history refetch drops the old line", async () => {
    // The fix posts a new line with a new id; the refreshed history no longer has this one.
    page.mockResolvedValueOnce({ items: [line], olderBefore: null }).mockResolvedValue({
      items: [{ ...line, id: "row-2", entryId: "new-entry" }],
      olderBefore: null,
    });
    (callCorrectDiaryEntry as jest.Mock).mockResolvedValue({
      status: "fixed",
      entryId: "new-entry",
    });
    const user = userEvent.setup();
    await renderRoute();
    await user.press(await screen.findByRole("button", { name: entryDetailCopy.fix }));
    await user.press(screen.getByRole("radio", { name: "Games" }));
    await user.press(screen.getByRole("button", { name: entryDetailCopy.saveFix }));
    expect(await screen.findByText(entryDetailCopy.fixed)).toBeOnTheScreen();
    await waitFor(() => expect(page).toHaveBeenCalledTimes(2));
    expect(screen.getByText(entryDetailCopy.fixed)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Loading")).toBeNull();
    await user.press(screen.getByRole("button", { name: "Done" }));
    expect(back).toHaveBeenCalled();
  });

  it("shows the error and a way back when the history can't load", async () => {
    page.mockRejectedValue(
      new AppError("UNAVAILABLE", "Jarso is taking a while. Please try again."),
    );
    const user = userEvent.setup();
    await renderRoute();
    expect(await screen.findByText("Jarso is taking a while. Please try again.")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: diaryCopy.backToDiary }));
    expect(back).toHaveBeenCalled();
  });

  it("says it can't find a line that isn't in the history", async () => {
    page.mockResolvedValue({ items: [], olderBefore: null });
    await renderRoute();
    expect(await screen.findByText(diaryCopy.notFound)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: diaryCopy.backToDiary })).toBeOnTheScreen();
  });
});
