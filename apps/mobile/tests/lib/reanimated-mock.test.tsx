import { render, screen } from "@testing-library/react-native";
import Animated from "react-native-reanimated";

describe("jest harness", () => {
  it("renders an Animated.View", async () => {
    await render(<Animated.View testID="a" />);
    expect(screen.getByTestId("a")).toBeTruthy();
  });
});
