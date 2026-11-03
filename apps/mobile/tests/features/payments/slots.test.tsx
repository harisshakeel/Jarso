import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import {
  AutoChargeSlot,
  type AutoChargeSlotProps,
  CardPaymentSlot,
  type CardPaymentSlotProps,
  SavedCardsSlot,
} from "@/features/payments";

const card: CardPaymentSlotProps = {
  kind: "allowance",
  id: "due-1",
  childId: "child-1",
  amountMinor: 500,
  currency: "GBP",
  split: { spendMinor: 300, saveMinor: 200 },
};
const auto: AutoChargeSlotProps = { target: { kind: "schedule", id: "schedule-1" } };

describe("payment slots", () => {
  it.each<[string, ReactElement]>([
    ["card with split", <CardPaymentSlot key="a" {...card} />],
    [
      "card without split",
      <CardPaymentSlot
        key="b"
        kind="gift"
        id="g-1"
        childId="c-1"
        amountMinor={100}
        currency="EUR"
      />,
    ],
    ["auto charge", <AutoChargeSlot key="c" {...auto} />],
    ["saved cards", <SavedCardsSlot key="d" />],
  ])("slots render nothing (%s)", async (_name, element) => {
    await render(element);
    expect(screen.toJSON()).toBeNull();
  });
});
