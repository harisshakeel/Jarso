import type { AutoChargeTarget } from "@jarso/core/payments";
import { getFamilyContext } from "@jarso/data/family";
import { fetchAutoChargeState } from "@jarso/data/payments";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** Where an auto-charge switch sits, as the screens name it. */
export type AutoChargeSlotTarget = { kind: "schedule" | "gift"; id: string };

export function toAutoChargeTarget(target: AutoChargeSlotTarget): AutoChargeTarget {
  return {
    type: target.kind === "schedule" ? "allowance_schedule" : "parent_gift",
    id: target.id,
  };
}

/**
 * A schedule's or gift's auto charge (on, whose provider, by whom, and whether a gift's day has
 * passed), read straight from Supabase with the parent's session. "Today" is the family's.
 */
export function useAutoChargeState(target: AutoChargeSlotTarget) {
  const { userId } = useSession();
  const resolved = toAutoChargeTarget(target);
  return useQuery({
    queryKey: keys.autoCharge(resolved.type, resolved.id),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { today } = await getFamilyContext(supabase, userId as string);
      return fetchAutoChargeState(supabase, resolved, today);
    },
  });
}
