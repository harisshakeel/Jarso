import type { NoticeRole } from "@jarso/core/notifications";
import { getFamilyContext } from "@jarso/data/family";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { useHome } from "@/features/jars";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * The family's currency, for a notice's wording. A child already has it from Home; a parent
 * reads the family's context (the same membership read, without the child's jars).
 */
export function useNoticeCurrency(role: NoticeRole): string | undefined {
  const { userId } = useSession();
  const home = useHome(role === "child");
  const family = useQuery({
    queryKey: keys.familyContext(userId ?? ""),
    enabled: role === "parent" && Boolean(userId),
    queryFn: () => getFamilyContext(supabase, userId as string),
    staleTime: 5 * 60_000,
  });
  return role === "child" ? home.data?.context.currency : family.data?.currency;
}
