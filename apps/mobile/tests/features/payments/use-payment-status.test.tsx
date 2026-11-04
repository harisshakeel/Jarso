import { AppError } from "@jarso/core/lib";
import type { PaymentStatusView } from "@jarso/core/payments";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { getPaymentStatus } from "@/features/payments/api";
import { usePaymentStatus } from "@/features/payments/use-payment-status";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/payments/api", () => ({ getPaymentStatus: jest.fn() }));

const read = getPaymentStatus as jest.Mock;
const view = (status: PaymentStatusView["status"]): PaymentStatusView => ({
  id: "p1",
  status,
  failureCode: null,
  final: status !== "pending" && status !== "requires_action",
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

/** Moves the fake clock and lets the reads it starts settle. */
async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("usePaymentStatus", () => {
  it("does nothing without a payment", async () => {
    const { wrapper } = setup();
    const { result } = await renderHook(() => usePaymentStatus(null), { wrapper });
    await advance(10_000);
    expect(read).not.toHaveBeenCalled();
    expect(result.current).toEqual({ view: null, stillConfirming: false });
  });

  it("stops polling at a final status and refreshes active queries", async () => {
    read
      .mockResolvedValueOnce(view("pending"))
      .mockResolvedValueOnce(view("pending"))
      .mockResolvedValue(view("succeeded"));
    const { invalidate, wrapper } = setup();
    const { result } = await renderHook(() => usePaymentStatus("p1"), { wrapper });
    await advance(0);
    expect(read).toHaveBeenCalledTimes(1);
    await advance(2_000);
    expect(read).toHaveBeenCalledTimes(2);
    await advance(2_000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(result.current.view?.status).toBe("succeeded");
    expect(invalidate).toHaveBeenCalledWith({ refetchType: "active" });
    await advance(30_000);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("shows still confirming after 15 seconds of pending, then polls every 5 s", async () => {
    read.mockResolvedValue(view("pending"));
    const { wrapper } = setup();
    const { result } = await renderHook(() => usePaymentStatus("p1"), { wrapper });
    await advance(14_000);
    expect(result.current.stillConfirming).toBe(false);
    await advance(2_000);
    expect(result.current.stillConfirming).toBe(true);
    const calls = read.mock.calls.length;
    await advance(4_000);
    expect(read).toHaveBeenCalledTimes(calls);
    await advance(1_000);
    expect(read).toHaveBeenCalledTimes(calls + 1);
  });

  it("gives up after 2 minutes", async () => {
    read.mockResolvedValue(view("pending"));
    const { wrapper } = setup();
    const { result } = await renderHook(() => usePaymentStatus("p1"), { wrapper });
    await advance(120_000);
    const calls = read.mock.calls.length;
    await advance(60_000);
    expect(read).toHaveBeenCalledTimes(calls);
    expect(result.current).toMatchObject({ stillConfirming: true, view: { status: "pending" } });
  });

  it("keeps polling after a failed status read", async () => {
    read
      .mockResolvedValueOnce(view("pending"))
      .mockRejectedValueOnce(new AppError("UNAVAILABLE", "offline"))
      .mockResolvedValue(view("succeeded"));
    const { wrapper } = setup();
    const { result } = await renderHook(() => usePaymentStatus("p1"), { wrapper });
    await advance(0);
    await advance(2_000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.view?.status).toBe("pending");
    await advance(2_000);
    expect(result.current.view?.status).toBe("succeeded");
  });

  it("stops when the session is refused", async () => {
    read.mockRejectedValue(new AppError("UNAUTHORIZED", "Sign in again"));
    const { wrapper } = setup();
    await renderHook(() => usePaymentStatus("p1"), { wrapper });
    await advance(10_000);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
