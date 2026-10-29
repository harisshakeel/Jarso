import { z } from "zod";
import { supportedCurrencies } from "@/config";

/**
 * Letters (any script), digits, space and _ . ' - only, so a nickname can't carry an email
 * address or a link into the invitation email. Mirrors register_child / create_invitation.
 * NFC first, so an accent typed as a separate mark still counts as part of its letter.
 */
const nickname = z
  .string()
  .trim()
  .normalize("NFC")
  .min(1, "Pick a nickname")
  .max(20, "Nickname can be up to 20 letters")
  .regex(/^[\p{L}\p{Nd} _.'-]+$/u, "Use letters, numbers, spaces, dots, dashes or apostrophes");

/** A pasted link token (64 hex) or short code; generous bound, still parsed and trimmed. */
const inviteValue = z
  .string()
  .trim()
  .min(1, "Enter your invite")
  .max(128, "That invite is too long");

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
  invite: inviteValue,
  nickname: nickname.optional(),
  pin,
  consent,
});

/** Accepting from the parent's own invitations list: the id is re-checked against that list. */
export const acceptListedInvitationSchema = z.object({
  invitationId: z.uuid("This invitation has expired or was already used."),
  nickname: nickname.optional(),
  pin,
  consent,
});

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** `?token=` / `?code=` on /invite: first value, trimmed; missing or invalid → undefined. */
const inviteParam = z.preprocess(firstValue, inviteValue.optional()).catch(undefined);

/** `?id=` on /invite: an invitation from the parent's own list; not a UUID → undefined. */
const invitationIdParam = z.preprocess(firstValue, z.uuid().optional()).catch(undefined);

export const inviteParamsSchema = z.object({
  token: inviteParam,
  code: inviteParam,
  id: invitationIdParam,
});

export const childSignInSchema = z.object({
  // Bounded before normalisation (spaces and dashes are stripped later).
  familyCode: z.string().max(16, "Check your family code").trim().min(1, "Enter your family code"),
  nickname: z.string().trim().min(1, "Enter your nickname").max(20, "Check your nickname"),
  pin: z.string().regex(/^\d{4,6}$/, "Your PIN is 4 to 6 numbers"),
});

export const setChildPinSchema = z.object({ childId: z.uuid(), pin });

export type CreateFamilyInput = z.infer<typeof createFamilySchema>;
export type AddChildInput = z.infer<typeof addChildSchema>;
export type StartChildOnboardingInput = z.infer<typeof startChildOnboardingSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type AcceptListedInvitationInput = z.infer<typeof acceptListedInvitationSchema>;
export type InviteParams = z.infer<typeof inviteParamsSchema>;
export type ChildSignInInput = z.infer<typeof childSignInSchema>;
export type SetChildPinInput = z.infer<typeof setChildPinSchema>;
