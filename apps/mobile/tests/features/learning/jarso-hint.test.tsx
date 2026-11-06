import { playerCopy } from "@jarso/core/learning";
import { render, screen } from "@testing-library/react-native";
import { JarsoHint } from "@/features/learning/jarso-hint";

describe("JarsoHint", () => {
  it("shows the line and the hints asked for", async () => {
    await render(
      <JarsoHint line="Price for just one?" hints={["Divide by the count"]} currency="GBP" />,
    );
    expect(screen.getByText("Price for just one?")).toBeOnTheScreen();
    expect(screen.getByText("Divide by the count")).toBeOnTheScreen();
    expect(screen.getByLabelText(playerCopy.hints)).toBeOnTheScreen();
  });

  it("shows no hint list when none are asked for", async () => {
    await render(<JarsoHint line="Take your time" hints={[]} currency="GBP" />);
    expect(screen.queryByLabelText(playerCopy.hints)).toBeNull();
  });

  it("drops the line but keeps hints once there is nothing left to say", async () => {
    await render(<JarsoHint line={null} hints={["Divide by the count"]} currency="GBP" />);
    expect(screen.getByText("Divide by the count")).toBeOnTheScreen();
  });

  it("renders nothing with no line and no hints", async () => {
    await render(<JarsoHint line={null} hints={[]} currency="GBP" />);
    expect(screen.toJSON()).toBeNull();
  });

  it("Jarso is decorative", async () => {
    await render(<JarsoHint line="Hmm" hints={[]} currency="GBP" />);
    expect(screen.queryByRole("image")).toBeNull();
  });
});
