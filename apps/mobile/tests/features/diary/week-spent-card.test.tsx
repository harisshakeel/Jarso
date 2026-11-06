import { weekSpentCopy } from "@jarso/core/ledger";
import { getHistorySince } from "@jarso/data/ledger";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { WeekSpentCard } from "@/features/diary";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "u1" }),
}));
jest.mock("@jarso/data/ledger", () => ({ getHistorySince: jest.fn() }));

const CONTEXT = { currency: "INR", timezone: "Asia/Kolkata", today: "2026-11-04" };
let n = 0;
const buy = (category: string, amountMinor: number) => ({
  id: `h${n++}`,
  kind: "purchase",
  amountMinor,
  dueMinor: null,
  label: category,
  occurredOn: "2026-11-03",
  undone: false,
  entryId: null,
  canUndo: false,
  paidByCard: false,
  category,
  jar: null,
  canFix: false,
  fixedFrom: null,
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WeekSpentCard context={CONTEXT} />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("WeekSpentCard", () => {
  it("shows the week's total and a bar per top category", async () => {
    (getHistorySince as jest.Mock).mockResolvedValue([
      buy("snacks", 9500),
      buy("games", 6000),
      buy("travel", 3000),
      buy("other", 1000),
    ]);
    await renderCard();
    expect(await screen.findByText(weekSpentCopy.heading)).toBeOnTheScreen();
    expect(screen.getByText("₹195")).toBeOnTheScreen();
    expect(screen.getAllByTestId("week-bar")).toHaveLength(3);
    expect(screen.getByLabelText("Snacks ₹95")).toBeOnTheScreen();
  });

  it("says nothing spent yet with no purchases", async () => {
    (getHistorySince as jest.Mock).mockResolvedValue([]);
    await renderCard();
    expect(await screen.findByText(weekSpentCopy.empty)).toBeOnTheScreen();
    expect(screen.queryByTestId("week-bar")).toBeNull();
  });

  it("hides while loading", async () => {
    (getHistorySince as jest.Mock).mockReturnValue(new Promise(() => undefined));
    await renderCard();
    await waitFor(() => expect(getHistorySince).toHaveBeenCalled());
    expect(screen.queryByText(weekSpentCopy.heading)).toBeNull();
  });
});
