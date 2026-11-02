import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientEnv, routes } from "@/config";
import { requireRole } from "@/features/family/server";
import { RazorpayCheckout, razorpayCheckoutParamsSchema } from "@/features/payments";
import { getRazorpayCheckoutFor } from "@/features/payments/server";

export const metadata: Metadata = { title: "Save a card", robots: { index: false } };

/** Where Checkout posts its form; it sends the parent on to `success` or `cancel`. */
const RETURN_PATH = "/api/v1/payments/razorpay/return";

type Props = { searchParams: PageProps<"/parent/payments/razorpay">["searchParams"] };

/**
 * Parent only, with Razorpay on, and only for the parent's own pending save-card order; checked
 * per request, after the query.
 */
async function RazorpayCheckoutContent({ searchParams }: Props) {
  const query = await searchParams;
  await requireRole("parent", routes.parent);
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL;
  const parsed = razorpayCheckoutParamsSchema(appUrl).safeParse(query);
  if (!parsed.success) notFound();
  const { order, customer, success, cancel } = parsed.data;
  const config = await getRazorpayCheckoutFor(order);
  if (!config) notFound();

  const callback = new URL(RETURN_PATH, appUrl);
  callback.searchParams.set("success", success);
  callback.searchParams.set("cancel", cancel);
  return (
    <RazorpayCheckout
      keyId={config.keyId}
      orderId={order}
      customerId={customer}
      callbackUrl={callback.toString()}
      cancelUrl={cancel}
    />
  );
}

/** Razorpay's save-card step (spec D6): opens Razorpay Checkout for the order the adapter made. */
export default function RazorpayCheckoutPage({ searchParams }: Props) {
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <Suspense fallback={null}>
        <RazorpayCheckoutContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
