import { z } from "zod";
import { moneySchema } from "@/lib";
import { paymentCopy } from "./copy";

/**
 * Pay by card: the same money parsing as the cash handover. The card always pays the item's
 * full amount, so the split must add up to it. The amount is only known per item, so the
 * server action builds this without it and `startCardPayment` re-checks the total.
 */
export const cardPaymentSchema = (currency: string, amountMinor?: number) =>
  z
    .object({
      kind: z.enum(["allowance", "gift"]),
      id: z.uuid("We couldn't find that."),
      cash: moneySchema(currency, { allowZero: true }),
      saved: moneySchema(currency, { allowZero: true }),
    })
    .refine((value) => value.cash + value.saved > 0, {
      message: "Enter how to split it.",
      path: ["cash"],
    })
    .refine((value) => amountMinor === undefined || value.cash + value.saved === amountMinor, {
      message: paymentCopy.fullAmount,
      path: ["cash"],
    })
    .transform(({ cash, saved, ...rest }) => ({ ...rest, cashMinor: cash, savedMinor: saved }));

/**
 * An in-app path to come back to after the hosted page: starts with one "/" and has no
 * backslash, so it can't name another host.
 */
export const returnToSchema = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\\]*$/, "Something went wrong. Please try again.");

/** A form posts "true" / "false"; a plain object may pass a boolean. */
const flag = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((value) => value === "true"),
]);

export const autoChargeSchema = z.object({
  type: z.enum(["allowance_schedule", "parent_gift"]),
  id: z.uuid("We couldn't find that."),
  on: flag,
  returnTo: returnToSchema,
});

/** Cancel the parent's abandoned checkout for one item, on the return from the hosted page. */
export const cancelCardPaymentSchema = z.object({
  childId: z.uuid("We couldn't find that."),
  kind: z.enum(["allowance", "gift"]),
  id: z.uuid("We couldn't find that."),
});

/** `?card=` on a page the provider sends the parent back to; anything else is ignored. */
export const cardReturnParamsSchema = z.object({
  card: z
    .preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.enum(["returned", "saved", "cancelled"]).optional(),
    )
    .catch(undefined),
});

export type CardPaymentInput = z.infer<ReturnType<typeof cardPaymentSchema>>;
export type AutoChargeInput = z.infer<typeof autoChargeSchema>;

/** A query value: the first one when the key repeats. */
const single = <S extends z.ZodType>(schema: S) =>
  z.preprocess((value) => (Array.isArray(value) ? value[0] : value), schema);

/**
 * A return URL from the fake hosted page, as an in-app path. Accepts a path or an absolute URL on
 * `appUrl`'s origin, so the page can't be used to send someone to another site.
 */
const appPathSchema = (appUrl: string) =>
  z
    .string()
    .max(2048)
    .transform((value, ctx) => {
      let url: URL | null = null;
      try {
        url = new URL(value, appUrl);
      } catch {}
      const path = url ? `${url.pathname}${url.search}${url.hash}` : "";
      if (url?.origin !== new URL(appUrl).origin || !returnToSchema.safeParse(path).success) {
        ctx.addIssue({ code: "custom", message: paymentCopy.badReturn });
        return z.NEVER;
      }
      return path;
    });

/** `/dev/payments/fake?mode=…&ref=…&success=…&cancel=…`, as the fake provider builds it. */
export const fakeCheckoutParamsSchema = (appUrl: string) =>
  z.object({
    mode: single(z.enum(["payment", "setup"])),
    ref: single(z.uuid()),
    success: single(appPathSchema(appUrl)),
    cancel: single(appPathSchema(appUrl)),
  });

/** A button on the fake hosted page. Each mode has its own outcomes. */
export const fakeCheckoutSchema = (appUrl: string) => {
  const ref = z.uuid();
  const success = appPathSchema(appUrl);
  const cancel = appPathSchema(appUrl);
  return z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("payment"),
      ref,
      outcome: z.enum(["pay", "fail", "cancel"]),
      success,
      cancel,
    }),
    z.object({
      mode: z.literal("setup"),
      ref,
      outcome: z.enum(["ok", "decline", "cancel"]),
      success,
      cancel,
    }),
  ]);
};

export type FakeCheckoutParams = z.infer<ReturnType<typeof fakeCheckoutParamsSchema>>;
export type FakeCheckoutInput = z.infer<ReturnType<typeof fakeCheckoutSchema>>;
