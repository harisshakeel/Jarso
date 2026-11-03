import type { CreateFamilyInput } from "@jarso/core/family";
import type { ParentDetailsInput } from "@jarso/core/profiles";
import { createFamilyWithFallback, findMembership } from "@jarso/data/family";
import { findParentDetails, upsertParentDetails } from "@jarso/data/profiles";
import {
  type QueryKey,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

export type ParentSetup = { profileComplete: boolean; familyId: string | null };

/** Both steps done: the parent's screens may open (ADR 0008 is enforced by the app). */
export const isSetUp = (setup: ParentSetup) => setup.profileComplete && setup.familyId !== null;

/** Whether the parent's details and family exist. Read by the `(parent)` gate and the setup screen. */
export function useParentSetup(): UseQueryResult<ParentSetup> {
  const { status, userId } = useSession();
  return useQuery({
    queryKey: keys.setup(userId ?? ""),
    // Only a parent session: the (parent) layout calls this before its role guard.
    enabled: status === "parent" && Boolean(userId),
    queryFn: async () => {
      const id = userId as string;
      const [details, membership] = await Promise.all([
        findParentDetails(supabase, id),
        findMembership(supabase, id),
      ]);
      return { profileComplete: details !== null, familyId: membership?.familyId ?? null };
    },
  });
}

/**
 * Marks a step done in the cached gate at once (so the gate can't bounce the parent back while
 * the refetch runs), then refetches the reads that depend on it.
 */
function useStepDone() {
  const client = useQueryClient();
  const { userId } = useSession();
  return (patch: Partial<ParentSetup>, also: QueryKey[] = []) => {
    const key = keys.setup(userId ?? "");
    client.setQueryData<ParentSetup>(key, (prev) => ({
      profileComplete: false,
      familyId: null,
      ...prev,
      ...patch,
    }));
    for (const queryKey of [key, ...also]) void client.invalidateQueries({ queryKey });
  };
}

/** Records the parent's date of birth, country and gender (complete_parent_profile). */
export function useSaveParentDetails() {
  const done = useStepDone();
  const { userId } = useSession();
  return useMutation({
    mutationFn: (input: ParentDetailsInput) => upsertParentDetails(supabase, input),
    // Settings reads the same details.
    onSuccess: () => done({ profileComplete: true }, [keys.profile(userId ?? "")]),
  });
}

/** Creates the parent's family; a timezone Postgres rejects falls back to UTC. */
export function useCreateFamily() {
  const done = useStepDone();
  const { userId } = useSession();
  return useMutation({
    mutationFn: (input: CreateFamilyInput) => createFamilyWithFallback(supabase, input),
    onSuccess: (family) => done({ familyId: family.id }, [keys.family(userId ?? "")]),
  });
}
