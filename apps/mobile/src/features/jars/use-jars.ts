import { getFamilyContext } from "@jarso/data/family";
import { getJars } from "@jarso/data/ledger";
import { getAvailability } from "@jarso/data/requests";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** One read for the child's Home: both jars, what they can move, and the family's currency. */
export function useHome() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.home(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async () => {
      const id = userId as string;
      const [jars, availability, context] = await Promise.all([
        getJars(supabase, id),
        getAvailability(supabase, id),
        getFamilyContext(supabase, id),
      ]);
      return { jars, availability, context };
    },
  });
}
