import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RazorpayCheckout } from "@/features/payments/components/razorpay-checkout";

const script = vi.hoisted(() => ({ src: "", fail: false }));

/** next/script stand-in: reports the script ready (or failed) once mounted. */
vi.mock("next/script", () => ({
  default: function Script(props: { src: string; onReady?: () => void; onError?: () => void }) {
    script.src = props.src;
    useEffect(() => {
      if (script.fail) props.onError?.();
      else props.onReady?.();
    }, [props.onReady, props.onError]);
    return null;
  },
}));

type Options = { modal: { ondismiss: () => void } } & Record<string, unknown>;
const opened = vi.hoisted(() => ({ options: [] as unknown[], open: vi.fn() }));

const props = {
  keyId: "rzp_test_XXXXXXXXXXXXXX",
  orderId: "order_TEST123",
  customerId: "cust_TEST123",
  callbackUrl:
    "http://localhost:3000/api/v1/payments/razorpay/return?success=http%3A%2F%2Flocalhost%3A3000%2Fparent&cancel=http%3A%2F%2Flocalhost%3A3000%2Fparent%3Fcard%3Dcancelled",
  cancelUrl: "http://localhost:3000/parent?card=cancelled",
};

const assign = vi.fn();

beforeEach(() => {
  script.fail = false;
  opened.options = [];
  vi.stubGlobal("location", { ...window.location, assign });
  vi.stubGlobal(
    "Razorpay",
    vi.fn(function checkoutConstructor(options: unknown) {
      opened.options.push(options);
      return { open: opened.open };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("RazorpayCheckout", () => {
  it("loads Checkout and opens it once with the save-card options", () => {
    render(
      <StrictMode>
        <RazorpayCheckout {...props} />
      </StrictMode>,
    );
    expect(script.src).toBe("https://checkout.razorpay.com/v1/checkout.js");
    expect(opened.open).toHaveBeenCalledTimes(1);
    expect(opened.options).toHaveLength(1);
    expect(opened.options[0]).toEqual({
      key: "rzp_test_XXXXXXXXXXXXXX",
      order_id: "order_TEST123",
      customer_id: "cust_TEST123",
      recurring: "1",
      redirect: true,
      callback_url: props.callbackUrl,
      modal: { ondismiss: expect.any(Function) },
    });
  });

  it("goes back to the cancel URL when the parent closes Checkout", () => {
    render(<RazorpayCheckout {...props} />);
    (opened.options[0] as Options).modal.ondismiss();
    expect(assign).toHaveBeenCalledWith(props.cancelUrl);
  });

  it("lets the parent open Checkout again", () => {
    render(<RazorpayCheckout {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Open the card form" }));
    expect(opened.open).toHaveBeenCalledTimes(2);
  });

  it("says so when Checkout can't load, and offers a way back", () => {
    script.fail = true;
    render(<RazorpayCheckout {...props} />);
    expect(opened.open).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/didn't load/);
    expect(screen.getByRole("link", { name: "Go back" }).getAttribute("href")).toBe(
      props.cancelUrl,
    );
  });
});
