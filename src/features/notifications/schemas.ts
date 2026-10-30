import { z } from "zod";

/** `null` marks every unread notice as read. */
export const markReadSchema = z.object({ ids: z.array(z.uuid()).max(100).nullable() });
