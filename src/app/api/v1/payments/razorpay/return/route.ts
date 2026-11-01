import { NextResponse } from "next/server";
import { clientEnv } from "@/config";
import { razorpayReturnFormSchema, razorpayReturnUrlsSchema } from "@/features/payments";
import { getRazorpayCheckoutConfig } from "@/features/payments/server";
import { AppError } from "@/lib";
import { withApi } from "@/lib/api";

/**
 * Where Razorpay Checkout posts its form after the save-card page (spec §7.1). Public on purpose:
 * the post comes from Razorpay's site, so it carries no session cookie and fails the same-origin
 * check. It changes nothing (the `order.paid` webhook saves the card) and only redirects, 303, to
 * a validated URL on Jarso's own origin: `success` when Checkout sent a payment id, else `cancel`,
 * and `/parent` when either URL is bad.
 */
export const POST = withApi(
  async (req: Request) => {
    if (!getRazorpayCheckoutConfig()) throw new AppError("NOT_FOUND", "Not found");
    const app = clientEnv.NEXT_PUBLIC_APP_URL;

    const query = new URL(req.url).searchParams;
    const urls = razorpayReturnUrlsSchema(app).safeParse({
      success: query.get("success") ?? undefined,
      cancel: query.get("cancel") ?? undefined,
    });
    if (!urls.success) return NextResponse.redirect(new URL("/parent", app), 303);

    const form = await req.formData().catch(() => null);
    const fields = razorpayReturnFormSchema.parse({
      razorpay_payment_id: form?.get("razorpay_payment_id") ?? undefined,
    });
    const to = fields.razorpay_payment_id ? urls.data.success : urls.data.cancel;
    return NextResponse.redirect(to, 303);
  },
  { crossOrigin: true },
);
