import { providerLogo } from "@jarso/core/payments";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderLogo } from "@/features/payments/components/provider-logo";

afterEach(cleanup);

describe("ProviderLogo", () => {
  it.each([
    ["stripe", "rgb(99, 91, 255)"],
    ["razorpay", "rgb(12, 36, 81)"],
  ] as const)("draws %s's mark on its brand tile, hidden from assistive tech", (id, colour) => {
    const { container } = render(<ProviderLogo provider={id} />);
    const tile = container.querySelector(`[data-provider-logo="${id}"]`);
    expect(tile).toHaveAttribute("aria-hidden", "true");
    expect(tile).toHaveStyle({ backgroundColor: colour });
    expect(tile?.querySelector("path")).toHaveAttribute("d", providerLogo(id)?.path);
  });

  it("draws nothing for the fake provider", () => {
    const { container } = render(<ProviderLogo provider="fake" />);
    expect(container).toBeEmptyDOMElement();
  });
});
