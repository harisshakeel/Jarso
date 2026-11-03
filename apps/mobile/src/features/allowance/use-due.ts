import { type ChildDueItem, mergeDue } from "@jarso/core/allowance";
import type { ChildSummary } from "@jarso/core/family";
import { listDueForParent } from "@jarso/data/allowance";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * Every allowance and gift waiting to be handed over, across the family, oldest first (the web's
 * "Needs you"). Read per child, merged with core's `mergeDue`.
 */
export function useFamilyDue(children: ChildSummary[] | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...keys.familyDue(userId ?? ""), children?.map((child) => child.id)],
    enabled: Boolean(userId) && children !== undefined,
    queryFn: async (): Promise<ChildDueItem[]> => {
      const perChild = await Promise.all(
        (children ?? []).map(async (child) => ({
          child,
          due: await listDueForParent(supabase, child.id),
        })),
      );
      return mergeDue(perChild);
    },
  });
}
