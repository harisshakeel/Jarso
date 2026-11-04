import { type AutoChargeCard, paymentCopy } from "@jarso/core/payments";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { getPaymentProviders, removeCard } from "@/features/payments/api";
import { SavedCardsSlot } from "@/features/payments/saved-cards-slot";
import { flash } from "@/lib/flash";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@/features/payments/api", () => ({
  getPaymentProviders: jest.fn(),
  removeCard: jest.fn(),
}));

const card = (provider: "stripe" | "razorpay", saved: boolean): AutoChargeCard => ({
  provider,
  label: provider === "stripe" ? "Stripe" : "Razorpay",
  cardSaved: saved,
  card: saved ? { brand: "visa", last4: provider === "stripe" ? "4242" : "1111" } : null,
  unavailableReason: null,
  needsPhone: false,
});

async function renderSlot(cards: AutoChargeCard[]) {
  (getPaymentProviders as jest.Mock).mockResolvedValue({ cards, item: null });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  await render(
    <QueryClientProvider client={client}>
      <SavedCardsSlot />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("SavedCardsSlot", () => {
  it("renders nothing when card payments are off", async () => {
    await renderSlot([]);
    await waitFor(() => expect(getPaymentProviders).toHaveBeenCalledWith(undefined));
    expect(screen.toJSON()).toBeNull();
  });

  it("says no card is saved yet", async () => {
    await renderSlot([card("stripe", false)]);
    expect(await screen.findByText("Saved cards")).toBeTruthy();
    expect(screen.getByText(paymentCopy.noCard)).toBeTruthy();
  });

  it("lists each saved card with its provider", async () => {
    await renderSlot([card("stripe", true), card("razorpay", false)]);
    expect(await screen.findByText("Saved card")).toBeTruthy();
    expect(screen.getByText(paymentCopy.cardEnding("visa", "4242"))).toBeTruthy();
    expect(screen.getByText("Stripe")).toBeTruthy();
    expect(screen.queryByText(paymentCopy.cardEnding("visa", "1111"))).toBeNull();
  });

  it("removes a card after confirming", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    (removeCard as jest.Mock).mockResolvedValue(undefined);
    await renderSlot([card("stripe", false), card("razorpay", true)]);
    await userEvent.setup().press(
      await screen.findByRole("button", {
        name: `${paymentCopy.removeCard}, ${paymentCopy.cardEnding("visa", "1111")}`,
      }),
    );
    expect(alert).toHaveBeenCalledWith(
      paymentCopy.removeTitle,
      paymentCopy.removeDetail,
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    expect(buttons.map((b) => b.text)).toEqual([paymentCopy.keepCard, paymentCopy.remove]);
    expect(removeCard).not.toHaveBeenCalled();
    buttons[1]?.onPress?.();
    await waitFor(() => expect(removeCard).toHaveBeenCalledWith("razorpay"));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(paymentCopy.removed));
  });
});
