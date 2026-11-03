import { listGiftsFor } from "@jarso/data/allowance";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** The child's gifts not handed over yet (due and coming up), soonest first. */
export function useChildGifts(childId: string) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.childGifts(childId),
    enabled: Boolean(userId),
    queryFn: () => listGiftsFor(supabase, childId, userId as string),
  });
}
