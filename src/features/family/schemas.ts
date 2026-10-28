import { z } from "zod";
import { supportedCurrencies } from "@/config";

const nickname = z
  .string()
  .trim()
  .min(1, "Pick a nickname")
  .max(20, "Nickname can be up to 20 letters");

const pin = z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 numbers");

/** Checkbox ("on") or JSON `true`; parsed to a boolean that is passed on to register_child. */
const consent = z
  .union([z.literal("on"), z.literal(true)], { error: "A parent needs to say yes first" })
  .transform((value) => value === "on" || value === true);

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const createFamilySchema = z.object({
  currency: z.enum(supportedCurrencies, { error: "Choose a currency" }),
  timezone: z.string().refine(isValidTimezone, "Choose a valid timezone"),
});

export const addChildSchema = z.object({ nickname, pin, consent });

export const startChildOnboardingSchema = z.object({
  nickname,
  parentEmail: z.email("Enter a valid email"),
});

export const acceptInvitationSchema = z.object({
  invite: z.string().trim().min(1, "Enter your invite"),
  nickname: nickname.optional(),
  pin,
  consent,
});

export const childSignInSchema = z.object({
  familyCode: z.string().trim().min(1, "Enter your family code"),
  nickname: z.string().trim().min(1, "Enter your nickname"),
  pin: z.string().min(1, "Enter your PIN"),
});

export const setChildPinSchema = z.object({ childId: z.uuid(), pin });

export type CreateFamilyInput = z.infer<typeof createFamilySchema>;
export type AddChildInput = z.infer<typeof addChildSchema>;
export type StartChildOnboardingInput = z.infer<typeof startChildOnboardingSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type ChildSignInInput = z.infer<typeof childSignInSchema>;
export type SetChildPinInput = z.infer<typeof setChildPinSchema>;
