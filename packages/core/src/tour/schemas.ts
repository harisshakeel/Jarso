import { coachIds } from "@jarso/core/learning";
import { z } from "zod";

/** What the tour saves: the buddy the child picked, and that they finished or skipped it. */
export const saveTourSchema = z
  .object({
    buddy: z.enum(coachIds).optional(),
    finished: z.boolean().optional(),
  })
  .refine((input) => input.buddy !== undefined || input.finished !== undefined, {
    message: "Nothing to save",
  });

export type SaveTourInput = z.infer<typeof saveTourSchema>;
