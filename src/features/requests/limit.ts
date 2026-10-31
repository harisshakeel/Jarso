import type { Availability } from "./types";

/**
 * How much the child can ask to take out right now: the room under their cap, which the
 * service already keeps to no more than free Save, or the free Save when there is no cap.
 */
export function takeOutLimit(availability: Availability): number {
  return availability.takeOutLimitMinor ?? availability.availableSaveMinor;
}
