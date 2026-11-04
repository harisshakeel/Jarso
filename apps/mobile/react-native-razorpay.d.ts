// react-native-razorpay ships no types. Only the part the card sheet uses
// (src/features/payments/sheets/razorpay.ts).
declare module "react-native-razorpay" {
  export type RazorpayCheckoutOptions = {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    method?: Partial<
      Record<"card" | "netbanking" | "upi" | "wallet" | "emi" | "paylater", boolean>
    >;
    customer_id?: string;
    recurring?: "1";
    prefill?: { email?: string; contact?: string };
    theme?: { color?: string };
  };
  /** Resolves with the payment id and signature (unused: the webhook is the truth); rejects on dismiss or failure. */
  const RazorpayCheckout: {
    open(options: RazorpayCheckoutOptions): Promise<unknown>;
  };
  export default RazorpayCheckout;
}
