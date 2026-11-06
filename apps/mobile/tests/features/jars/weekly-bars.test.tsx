import type { WeekTotal } from "@jarso/core/ledger";
import { render, screen } from "@testing-library/react-native";
import { WeeklyBars } from "@/features/jars";

const week = (
  weekStart: string,
  label: string,
  amountMinor: number,
  current = false,
): WeekTotal => ({
  weekStart,
  label,
  amountMinor,
  current,
});
const totals = (amounts: number[]): WeekTotal[] => {
  const labels = ["Sep 28", "5", "12", "19", "26", "This week"];
  return amounts.map((a, i) => week(`2026-10-0${i + 1}`, labels[i] ?? "", a, i === 5));
};

describe("WeeklyBars", () => {
  it("shows six bars each with its amount and week", async () => {
    await render(
      <WeeklyBars jar="save" currency="GBP" totals={totals([1000, 2000, 500, 0, 3000, 7000])} />,
      {},
    );
    for (const text of ["£10", "£20", "£5", "£30", "£70", "Sep 28", "26", "This week"]) {
      expect(screen.getByText(text, { includeHiddenElements: true })).toBeOnTheScreen();
    }
  });

  it("highlights this week and shows Best week when it is the best", async () => {
    await render(
      <WeeklyBars jar="save" currency="GBP" totals={totals([1000, 2000, 500, 0, 3000, 7000])} />,
    );
    expect(screen.getByTestId("bar-current", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText("Best week!")).toBeOnTheScreen();
  });

  it("no Best week chip on a tie or a negative week", async () => {
    const { rerender } = await render(
      <WeeklyBars jar="save" currency="GBP" totals={totals([1000, 2000, 500, 0, 3000, 3000])} />,
    );
    expect(screen.queryByText("Best week!")).not.toBeOnTheScreen();
    await rerender(
      <WeeklyBars jar="save" currency="GBP" totals={totals([1000, 2000, 500, 0, 3000, -500])} />,
    );
    expect(screen.queryByText("Best week!")).not.toBeOnTheScreen();
  });

  it("a negative week is a calm stub with a minus sign", async () => {
    await render(
      <WeeklyBars jar="save" currency="GBP" totals={totals([1000, 2000, 500, 0, -3000, 100])} />,
    );
    expect(screen.getByText("−£30", { includeHiddenElements: true })).toBeOnTheScreen();
    const stub = screen.getByTestId("bar-current", { includeHiddenElements: true });
    expect(String(stub.props.className ?? "")).not.toMatch(/destructive|red/);
    expect(JSON.stringify(stub.props.style)).not.toMatch(/red/);
  });

  it("all zero weeks still draw six stubs, never NaN heights", async () => {
    await render(<WeeklyBars jar="spend" currency="GBP" totals={totals([0, 0, 0, 0, 0, 0])} />);
    const stub = screen.getByTestId("bar-current", { includeHiddenElements: true });
    expect(JSON.stringify(stub.props.style)).not.toMatch(/NaN/);
    expect(JSON.stringify(stub.props.style)).toContain("3%");
    expect(screen.getAllByText("£0", { includeHiddenElements: true })).toHaveLength(6);
  });

  it("screen readers get one summary of the bars", async () => {
    await render(
      <WeeklyBars jar="save" currency="GBP" totals={totals([1000, 2000, 500, 0, 3000, 7000])} />,
    );
    expect(
      screen.getByLabelText(
        "Save jar, last 6 weeks: Sep 28 £10, 5 £20, 12 £5, 19 £0, 26 £30, This week £70",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText("£70")).not.toBeOnTheScreen();
  });
});
