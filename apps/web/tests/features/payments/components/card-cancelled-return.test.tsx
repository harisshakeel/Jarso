import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardCancelledReturn } from "@/features/payments/components/card-cancelled-return";

const cancelCardPaymentAction = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/features/payments/server/actions", () => ({ cancelCardPaymentAction }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/parent/children/c1/handover/allowance/o1",
  useRouter: () => ({ replace }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = {
  childId: "00000000-0000-4000-8000-000000000001",
  kind: "allowance" as const,
  id: "00000000-0000-4000-8000-000000000002",
};

describe("CardCancelledReturn", () => {
  it("cancels the abandoned checkout once, then drops ?card from the URL", async () => {
    cancelCardPaymentAction.mockResolvedValue({ ok: true, data: undefined });
    render(
      <StrictMode>
        <CardCancelledReturn {...props} />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/parent/children/c1/handover/allowance/o1", {
        scroll: false,
      }),
    );
    expect(cancelCardPaymentAction).toHaveBeenCalledTimes(1);
    expect(cancelCardPaymentAction).toHaveBeenCalledWith(null, props);
  });

  it("still drops ?card when the cancel fails (the checkout then just expires)", async () => {
    cancelCardPaymentAction.mockResolvedValue({
      ok: false,
      error: { code: "UNAVAILABLE", message: "Try again." },
    });
    render(<CardCancelledReturn {...props} />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });
});
