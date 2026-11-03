import { findNickname } from "@jarso/data/family";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** The child's sign-in nickname. Until it loads (or if it fails) the screen uses its fallback line. */
export function useNickname() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.nickname(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => findNickname(supabase, userId as string),
  });
}
