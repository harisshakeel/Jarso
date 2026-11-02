"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { routes } from "@/config";
import { safeNextPath } from "@/features/auth";
import { AppError, createAction, isAppError } from "@/lib";
import {
  acceptInvitationSchema,
  acceptListedInvitationSchema,
  addChildSchema,
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
  childSignIn,
  createFamily,
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

/** A duplicate nickname comes back from register_child as CONFLICT; show it on the field. */
function nicknameConflict(error: unknown): never {
  if (isAppError(error) && error.code === "CONFLICT") {
    throw new AppError("CONFLICT", "Please fix the highlighted fields.", {
      fieldErrors: { nickname: ["Another child in your family already uses this nickname"] },
      cause: error,
    });
  }
  throw error;
}

export const addChildAction = createAction(addChildSchema, async ({ nickname, pin, consent }) => {
  const { membership } = await assertRole("parent");
  if (!membership) throw new AppError("FORBIDDEN", "Set up your family first.");
  try {
    await addChild({ familyId: membership.familyId, nickname, pin, consent });
  } catch (error) {
    nicknameConflict(error);
  }
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
  try {
    await acceptInvitation(input);
  } catch (error) {
    nicknameConflict(error);
  }
  redirect(routes.parent);
});

export const acceptListedInvitationAction = createAction(
  acceptListedInvitationSchema,
  async (input) => {
    try {
      await acceptListedInvitation(input);
    } catch (error) {
      nicknameConflict(error);
    }
    redirect(routes.parent);
  },
);

export const setChildPinAction = createAction(setChildPinSchema, async (input) => {
  await assertParentOf(input.childId);
  await setChildPin(input);
});

export const renameChildAction = createAction(renameChildSchema, async (input) => {
  await assertParentOf(input.childId);
  try {
    await renameChild(input);
  } catch (error) {
    nicknameConflict(error);
  }
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
