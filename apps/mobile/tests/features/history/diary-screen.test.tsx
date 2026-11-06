import { jarPageCopy } from "@jarso/core/ledger";
import { render, screen, userEvent } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { DiaryScreen } from "@/features/history";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "u1" }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/jars", () => ({
  useHome: () => ({
    data: {
      jars: { spend: 4500, save: 12000 },
      context: { currency: "INR", timezone: "Asia/Kolkata", today: "2026-11-04" },
    },
  }),
}));
const mockWeekCard = jest.fn((_props: unknown) => null);
jest.mock("@/features/diary", () => ({
  PendingPurchases: () => null,
  WeekSpentCard: (props: unknown) => mockWeekCard(props),
}));
// The list itself has its own tests; here only the header the Diary hands it.
jest.mock("@/features/history/history-list", () => ({
  HistoryList: ({ header }: { header: ReactElement }) => header,
}));

beforeEach(() => jest.clearAllMocks());

describe("DiaryScreen", () => {
  it("actions use the new names and open their sheets", async () => {
    await render(<DiaryScreen />);
    const [bought, got] = jarPageCopy.actions.spend;
    await userEvent.press(screen.getByRole("button", { name: bought?.label }));
    expect(mockPush).toHaveBeenCalledWith("/(child)/purchase");
    await userEvent.press(screen.getByRole("button", { name: got?.label }));
    expect(mockPush).toHaveBeenCalledWith("/(child)/received");
    expect(screen.getByText(bought?.hint ?? "")).toBeOnTheScreen();
  });

  it("shows the week card in the list's header", async () => {
    await render(<DiaryScreen />);
    expect(screen.getByRole("header", { name: "Diary" })).toBeOnTheScreen();
    expect(mockWeekCard).toHaveBeenCalledWith({
      context: { currency: "INR", timezone: "Asia/Kolkata", today: "2026-11-04" },
    });
    expect(screen.getByLabelText("Spend jar")).toBeOnTheScreen();
  });
});
