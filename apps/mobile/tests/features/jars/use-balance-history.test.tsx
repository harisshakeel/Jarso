import { weeklyTotals } from "@jarso/core/ledger";
import { listMovementsSince } from "@jarso/data/ledger";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useBalanceHistory } from "@/features/jars";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/ledger", () => ({
  ...jest.requireActual("@jarso/data/ledger"),
  listMovementsSince: jest.fn(),
}));

const context = {
  currency: "INR",
  timezone: "Asia/Kolkata",
  today: "2026-11-06",
};

describe("useBalanceHistory", () => {
  it("counts a Monday 00:30 Kolkata purchase in the new week", async () => {
    (listMovementsSince as jest.Mock).mockResolvedValue([
      { jar: "spend", direction: "out", amountMinor: 1000, occurredAt: "2026-11-01T19:00:00Z" },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(
      () => useBalanceHistory({ spend: 4000, save: 0 }, context),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    const totals = weeklyTotals(result.current.data as never, "spend", context.today);
    expect(totals.at(-1)?.amountMinor).toBe(-1000);
    expect(totals.at(-2)?.amountMinor).toBe(0);
  });
});
