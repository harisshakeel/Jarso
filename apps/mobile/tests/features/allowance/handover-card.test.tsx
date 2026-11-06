import { dueListCopy, formatDay, needsYouCopy } from "@jarso/core/allowance";
import { familyCardsCopy } from "@jarso/core/dashboard";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { HandoverCard } from "@/features/allowance";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));

const push = jest.fn();
const item = {
  kind: "gift",
  id: "gift-1",
  dueOn: "2026-11-03",
  amountMinor: 300,
  note: "Birthday",
} as const;

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push });
});

describe("HandoverCard", () => {
  it("names the child and the due day", async () => {
    await render(<HandoverCard childId="child-1" item={item} currency="GBP" nickname="Sam" />);
    expect(screen.getByText("Sam · Gift · £3.00")).toBeOnTheScreen();
    expect(
      screen.getByText(familyCardsCopy.dueLine(formatDay("2026-11-03"), "Birthday")),
    ).toBeOnTheScreen();
  });

  it("opens the handover sheet", async () => {
    await render(<HandoverCard childId="child-1" item={item} currency="GBP" nickname="Sam" />);
    await userEvent.setup().press(
      screen.getByRole("button", {
        name: needsYouCopy.handOverLabel("gift", "Sam", formatDay("2026-11-03")),
      }),
    );
    expect(push).toHaveBeenCalledWith("/(parent)/children/child-1/handover/gift/gift-1");
  });

  it("without a nickname uses the hub's label", async () => {
    await render(<HandoverCard childId="child-1" item={item} currency="GBP" />);
    expect(screen.getByText("Gift · £3.00")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: `${dueListCopy.handOver}: Gift · Birthday, ${dueListCopy.due(formatDay("2026-11-03"))}, £3.00`,
      }),
    ).toBeOnTheScreen();
  });
});
