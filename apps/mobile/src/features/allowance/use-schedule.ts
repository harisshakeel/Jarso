import { getParentSchedule } from "@jarso/data/allowance";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** The child's latest allowance schedule (a stopped one too), as the parent sees it. */
export function useChildSchedule(childId: string) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.childSchedule(childId),
    enabled: Boolean(userId),
    queryFn: () => getParentSchedule(supabase, childId, userId as string),
  });
}
