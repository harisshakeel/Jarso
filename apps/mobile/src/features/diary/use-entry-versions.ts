import { earlierVersions } from "@jarso/core/diary";
import { callListEntryVersions } from "@jarso/data/diary";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * A line's earlier versions, newest first, without the current one (SQL checks the line is the
 * caller's). Loads only once `enabled`: when asked for, or at once for a fixed line.
 */
export function useEntryVersions(entryId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.versions(entryId),
    enabled,
    queryFn: () => callListEntryVersions(supabase, entryId),
    select: (versions) => earlierVersions(versions, entryId),
  });
}
