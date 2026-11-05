import "server-only";
import type { SaveTourInput, TourState } from "@jarso/core/tour";
import { serverEnv } from "@/config/env.server";
// The child's welcome tour. Reads: the child or a parent. Writes: the signed-in child only (the
// database function refuses anyone else).
import { assertUser } from "@/features/auth/server";
import { assertSelfOrParentOf } from "@/features/family/server";
import { createClient } from "@/lib/supabase/server";
import { findTour, saveTour } from "./repository";

export async function getTour(childId: string): Promise<TourState> {
  await assertSelfOrParentOf(childId);
  return findTour(await createClient(), childId);
}

/** Whether the tour opens by itself on a first visit (the e2e server turns it off). */
export function welcomeTourOn(): boolean {
  return serverEnv.FEATURE_WELCOME_TOUR;
}

/** Saves the signed-in child's buddy and/or that they finished (or skipped) the tour. */
export async function saveMyTour(input: SaveTourInput): Promise<void> {
  await assertUser();
  await saveTour(await createClient(), input);
}
