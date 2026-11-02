"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { routes } from "@/config";
import { safeNextPath } from "@/features/auth";
import { AppError, createAction } from "@/lib";
import {
  acceptInvitationSchema,
  acceptListedInvitationSchema,
  addChildSchema,
  advanceFamilyClockSchema,
  childSignInSchema,
  createFamilySchema,
  removeChildSchema,
  renameChildSchema,
  setChildPinSchema,
  startChildOnboardingSchema,
  updateFamilySettingsSchema,
} from "../schemas";
import { getClientIp } from "./client-ip";
import { assertParentOf, assertRole } from "./dal";
import {
  acceptInvitation,
  acceptListedInvitation,
  addChild,
  advanceFamilyClock,
  childSignIn,
  createFamily,
  demoClockEnabled,
  removeChild,
  renameChild,
  setChildPin,
  startChildOnboarding,
  updateFamilySettings,
} from "./service";

/** `next` lets the invite flow send the parent back to /invite?token=… after setup. */
const createFamilyFormSchema = createFamilySchema.extend({ next: z.string().optional() });

export const createFamilyAction = createAction(
  createFamilyFormSchema,
  async ({ next, ...input }) => {
    await assertRole("parent");
    await createFamily(input);
    redirect(safeNextPath(next, routes.parent));
  },
);

export const addChildAction = createAction(addChildSchema, async ({ nickname, pin, consent }) => {
  const { membership } = await assertRole("parent");
  if (!membership) throw new AppError("FORBIDDEN", "Set up your family first.");
  // A taken nickname comes back with a field error from the repository.
  await addChild({ familyId: membership.familyId, nickname, pin, consent });
  redirect(routes.parent);
});

/** Public: a signed-out child asks a parent to join. Returns the link and code to show them. */
export const startChildOnboardingAction = createAction(startChildOnboardingSchema, async (input) =>
  startChildOnboarding(input, await getClientIp()),
);

/** Public: child PIN sign-in. The service rate-limits and mints the session cookie. */
export const childSignInAction = createAction(childSignInSchema, async (input) => {
  await childSignIn(input, await getClientIp());
  redirect(routes.child);
});

export const acceptInvitationAction = createAction(acceptInvitationSchema, async (input) => {
  await acceptInvitation(input);
  redirect(routes.parent);
});

export const acceptListedInvitationAction = createAction(
  acceptListedInvitationSchema,
  async (input) => {
    await acceptListedInvitation(input);
    redirect(routes.parent);
  },
);

export const setChildPinAction = createAction(setChildPinSchema, async (input) => {
  await assertParentOf(input.childId);
  await setChildPin(input);
});

export const renameChildAction = createAction(renameChildSchema, async (input) => {
  await assertParentOf(input.childId);
  await renameChild(input);
  refresh();
});

// No assertParentOf here: after a partial removal the child is no longer "approved", so that
// check would block the retry. remove_child authorises in the database (see removeChild).
export const removeChildAction = createAction(removeChildSchema, async (input) => {
  await assertRole("parent");
  await removeChild(input);
  refresh();
});

export const updateFamilySettingsAction = createAction(
  updateFamilySettingsSchema,
  async (input) => {
    await assertRole("parent");
    await updateFamilySettings(input);
    refresh();
  },
);

/**
 * Demo clock (D11): a parent moves their demo family's clock forward. Every screen reads the
 * family's day, so the whole app is revalidated.
 */
export const advanceFamilyClockAction = createAction(advanceFamilyClockSchema, async (input) => {
  if (!demoClockEnabled()) throw new AppError("FORBIDDEN", "The demo clock is off.");
  await assertRole("parent");
  const result = await advanceFamilyClock(input);
  revalidatePath("/", "layout");
  return result;
});
