import type { FamilyDashboard } from "@jarso/core/dashboard";
import type { ChildSummary, Family } from "@jarso/core/family";
import { getFamilyDashboard } from "@jarso/data/dashboard";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import { findParentDetails, findProfileById } from "@jarso/data/profiles";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { useParentGuideState } from "@/features/guide";
import { AppError } from "@/lib";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

export type FamilyData = { family: Family; children: ChildSummary[] };

/** No family behind the setup gate means the gate is stale: say so calmly, never crash. */
const NO_FAMILY = "We couldn't find your family. Pull down to try again.";

/** The parent's family (code, currency, timezone) and children, in the family's order. */
export function useFamily() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.family(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<FamilyData> => {
      const membership = await findMembership(supabase, userId as string);
      if (!membership) throw new AppError("NOT_FOUND", NO_FAMILY);
      const [family, children] = await Promise.all([
        findFamilyById(supabase, membership.familyId),
        listChildMembers(supabase, membership.familyId),
      ]);
      if (!family) throw new AppError("NOT_FOUND", NO_FAMILY);
      return { family, children };
    },
  });
}

/**
 * The family dashboard reads (jars, due, schedule, gifts, history per child) for the last `days`
 * days, as the web's parent Home builds them. Chats are read only when Jarso is set up.
 */
export function useDashboard(days = 7) {
  const { userId } = useSession();
  const guideOn = useParentGuideState().data?.configured === true;
  return useQuery({
    queryKey: keys.dashboard(userId ?? "", days),
    enabled: Boolean(userId),
    queryFn: async (): Promise<FamilyDashboard> => {
      const data = await getFamilyDashboard(supabase, {
        userId: userId as string,
        days,
        now: new Date(),
        guideOn,
      });
      if (!data) throw new AppError("NOT_FOUND", NO_FAMILY);
      return data;
    },
  });
}

/** Jarso's sentence or two about the family (Claude, on the server). Only while Jarso is set up. */
export function useFamilySummary(days = 7) {
  const { userId } = useSession();
  const guideOn = useParentGuideState().data?.configured === true;
  return useQuery({
    queryKey: keys.summary(userId ?? "", days),
    enabled: Boolean(userId) && guideOn,
    queryFn: () =>
      apiFetch<{ text: string | null }>(`/api/v1/family/summary?days=${days}`, { auth: true }),
    staleTime: 10 * 60_000,
  });
}

/** The parent's own name and details, for settings. */
export function useParentProfile() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.profile(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async () => {
      const id = userId as string;
      const [profile, details] = await Promise.all([
        findProfileById(supabase, id),
        findParentDetails(supabase, id),
      ]);
      return { fullName: profile?.fullName ?? null, details };
    },
  });
}
