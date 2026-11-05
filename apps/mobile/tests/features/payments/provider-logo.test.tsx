import { providerLogo } from "@jarso/core/payments";
import { render, screen } from "@testing-library/react-native";
import { ProviderLogo } from "@/features/payments/provider-logo";

describe("ProviderLogo", () => {
  it("draws the mark on the brand-coloured tile, hidden from screen readers", async () => {
    await render(<ProviderLogo provider="stripe" />);
    // Not reachable by assistive tech: only found when hidden elements are included.
    expect(screen.queryByTestId("provider-logo-stripe")).toBeNull();
    const tile = screen.getByTestId("provider-logo-stripe", { includeHiddenElements: true });
    expect(tile.props.accessibilityElementsHidden).toBe(true);
    expect(tile.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(tile).toHaveStyle({ backgroundColor: "#635BFF" });
    expect(JSON.stringify(screen.toJSON())).toContain(providerLogo("stripe")?.path.slice(0, 20));
  });

  it("uses Razorpay's colour for Razorpay", async () => {
    await render(<ProviderLogo provider="razorpay" />);
    expect(
      screen.getByTestId("provider-logo-razorpay", { includeHiddenElements: true }),
    ).toHaveStyle({ backgroundColor: "#0C2451" });
  });

  it("draws nothing for the fake provider", async () => {
    await render(<ProviderLogo provider="fake" />);
    expect(screen.toJSON()).toBeNull();
  });
});
