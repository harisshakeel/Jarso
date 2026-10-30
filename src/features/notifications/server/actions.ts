"use server";

import { revalidatePath } from "next/cache";
import { routes } from "@/config";
import { createAction } from "@/lib";
import { markReadSchema } from "../schemas";
import { markRead } from "./service";

export const markNoticesReadAction = createAction(markReadSchema, async ({ ids }) => {
  const changed = await markRead(ids);
  revalidatePath(routes.childInbox);
  revalidatePath(routes.parentInbox);
  return { changed };
});
