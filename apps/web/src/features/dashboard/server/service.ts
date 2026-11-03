import type { FamilyDashboard } from "@jarso/core/dashboard";
import * as shared from "@jarso/data/dashboard";
import { assertUser } from "@/features/auth/server";
import { currentRole } from "@/features/family/server";
import { isGuideConfigured } from "@/features/guide/server";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";

export type { FamilyDashboard };

/**
 * The parent's dashboard reads (spec 2026-11-02), shared with the phone in
 * `@jarso/data/dashboard`. Signed-in parents only (profile complete or not, like every parent
 * read); RLS limits each read to their own children. Null without a family.
 */
export async function getFamilyDashboard(days: number): Promise<FamilyDashboard | null> {
  const user = await assertUser();
  if ((await currentRole()) !== "parent") throw new AppError("FORBIDDEN", "You can't do that.");
  return shared.getFamilyDashboard(await createClient(), {
    userId: user.id,
    days,
    now: new Date(), // Server clock decides today.
    guideOn: isGuideConfigured(),
  });
}
