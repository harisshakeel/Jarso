import { rawTour } from "@jarso/content/tour";
import { coachIds } from "@jarso/core/learning";
import { z } from "zod";

/** Who can say a tour line out loud: one of the four kids, or Jarso. */
export const tourVoices = [...coachIds, "jarso"] as const;
export type TourVoice = (typeof tourVoices)[number];

const tourContentSchema = z.object({
  lines: z.record(z.string(), z.string().min(1)),
  voices: z.record(z.string(), z.enum(tourVoices)),
});

function parseTour(): z.infer<typeof tourContentSchema> {
  const result = tourContentSchema.safeParse(rawTour);
  if (!result.success) {
    throw new Error(`Invalid tour content:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/**
 * The tour's words (`@jarso/content/tour`), parsed once when the module loads, so a bad JSON edit
 * fails the build, the unit tests and CI rather than reaching a child.
 */
export const tourContent = parseTour();

/** A line's words as written, with {name} and {buddy} still in them. */
export function tourTemplate(lineId: string): string {
  const template = tourContent.lines[lineId];
  if (template === undefined) throw new Error(`The tour has no words for "${lineId}"`);
  return template;
}
