import { handleURLCallback } from "@stripe/stripe-react-native";
import { redirectStripeReturn } from "@/features/payments/sheets/stripe-return";

const callback = handleURLCallback as jest.Mock;

beforeEach(() => callback.mockReset().mockResolvedValue(true));

describe("redirectStripeReturn", () => {
  it.each([
    "jarso://stripe-redirect",
    "jarso://stripe-redirect?payment_intent=pi_1&redirect_status=succeeded",
    "/stripe-redirect",
  ])("hands %s to Stripe and keeps the current screen", async (path) => {
    await expect(redirectStripeReturn({ path, initial: false })).resolves.toBeNull();
    expect(callback).toHaveBeenCalledWith(path);
  });

  it("opens the home screen when the return URL launched the app", async () => {
    await expect(
      redirectStripeReturn({ path: "jarso://stripe-redirect", initial: true }),
    ).resolves.toBe("/");
  });

  it("still swallows the return URL when Stripe throws", async () => {
    callback.mockRejectedValueOnce(new Error("native"));
    await expect(
      redirectStripeReturn({ path: "jarso://stripe-redirect", initial: false }),
    ).resolves.toBeNull();
  });

  it.each(["jarso://parent/settings", "/stripe-redirector", "/child"])(
    "passes %s through to the router",
    async (path) => {
      await expect(redirectStripeReturn({ path, initial: false })).resolves.toBe(path);
      expect(callback).not.toHaveBeenCalled();
    },
  );
});
