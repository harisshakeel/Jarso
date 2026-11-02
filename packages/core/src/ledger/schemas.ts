import { z } from "zod";

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** `?before=` on the history page: the cursor of an older page; anything else → newest page. */
export const historyParamsSchema = z.object({
  before: z.preprocess(firstValue, z.iso.datetime({ offset: true }).optional()).catch(undefined),
});

export type HistoryParams = z.infer<typeof historyParamsSchema>;
