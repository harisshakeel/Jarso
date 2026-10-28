"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { routes } from "@/config";
import { safeNextPath } from "@/features/auth";
import { AppError, createAction, isAppError } from "@/lib";
import { addChildSchema, createFamilySchema, setChildPinSchema } from "../schemas";
import { assertParentOf, assertRole } from "./dal";
import { addChild, createFamily, setChildPin } from "./service";

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

export const addChildAction = createAction(addChildSchema, async ({ nickname, pin }) => {
  const { membership } = await assertRole("parent");
  if (!membership) throw new AppError("FORBIDDEN", "Set up your family first.");
  try {
    await addChild({ familyId: membership.familyId, nickname, pin });
  } catch (error) {
    if (isAppError(error) && error.code === "CONFLICT") {
      throw new AppError("CONFLICT", "Please fix the highlighted fields.", {
        fieldErrors: { nickname: ["Another child in your family already uses this nickname"] },
        cause: error,
      });
    }
    throw error;
  }
  redirect(routes.parent);
});

export const setChildPinAction = createAction(setChildPinSchema, async (input) => {
  await assertParentOf(input.childId);
  await setChildPin(input);
});
