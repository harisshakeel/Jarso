import { getProgress } from "@jarso/data/progress";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * A parent's read of one child's level, streak and Jarso look (`get_progress` lets a parent read
 * their own child). It refreshes with the child's other pages (the `child` prefix). The parent
 * app never shows the Sparks in it.
 */
export function useChildProgress(childId: string) {
  return useQuery({
    queryKey: keys.childProgress(childId),
    queryFn: () => getProgress(supabase, childId),
  });
}
