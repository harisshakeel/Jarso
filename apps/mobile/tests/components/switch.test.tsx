import { semantic } from "@jarso/brand/tokens";
import { render, screen } from "@testing-library/react-native";
import { Switch } from "@/components/ui";

describe("Switch", () => {
  it("off shows a solid track, on the primary one, so off never reads as blank", async () => {
    await render(<Switch accessibilityLabel="Auto charge" value={false} />);
    const off = screen.getByLabelText("Auto charge");
    expect(off.props.thumbTintColor).toBe("#ffffff");
    // Android reads trackColor through these: false → tintColor, true → onTintColor.
    expect(off.props.tintColor).toBe(semantic.light.input);
    expect(off.props.onTintColor).toBe(semantic.light.primary);
  });

  it("fades when disabled", async () => {
    await render(<Switch accessibilityLabel="Auto charge" value disabled />);
    expect(screen.getByLabelText("Auto charge")).toHaveStyle({ opacity: 0.5 });
  });
});
