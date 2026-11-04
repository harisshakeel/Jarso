import { type InAppSheet, paymentCopy } from "@jarso/core/payments";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { completeFakeSheet } from "@/features/payments/api";
import { type SheetOutcome, useFakeSheet } from "@/features/payments/sheets";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/payments/api", () => ({ completeFakeSheet: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));

const fakeSheet: Extract<InAppSheet, { provider: "fake" }> = {
  provider: "fake",
  mode: "payment",
  ref: "11111111-1111-4111-8111-111111111111",
};

function Harness({ onOutcome }: { onOutcome: (outcome: SheetOutcome) => void }) {
  const fake = useFakeSheet();
  return (
    <>
      {fake.element}
      <Text onPress={() => void fake.open(fakeSheet).then(onOutcome)}>open</Text>
    </>
  );
}

beforeEach(() => jest.clearAllMocks());

describe("the dev test-card dialog", () => {
  it("completes the fake payment through the server, then reports completed", async () => {
    (completeFakeSheet as jest.Mock).mockResolvedValue(undefined);
    const onOutcome = jest.fn();
    await render(<Harness onOutcome={onOutcome} />);
    const user = userEvent.setup();
    await user.press(screen.getByText("open"));
    expect(await screen.findByText(paymentCopy.fakeTitle)).toBeTruthy();
    await user.press(screen.getByRole("button", { name: paymentCopy.fakePay }));
    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith("completed"));
    expect(completeFakeSheet).toHaveBeenCalledWith({
      mode: "payment",
      ref: fakeSheet.ref,
      outcome: "pay",
    });
    expect(screen.queryByText(paymentCopy.fakeTitle)).toBeNull();
  });

  it("Go back closes without completing", async () => {
    const onOutcome = jest.fn();
    await render(<Harness onOutcome={onOutcome} />);
    const user = userEvent.setup();
    await user.press(screen.getByText("open"));
    await user.press(await screen.findByRole("button", { name: paymentCopy.goBack }));
    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith("closed"));
    expect(completeFakeSheet).not.toHaveBeenCalled();
  });
});
