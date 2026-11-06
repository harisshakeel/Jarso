import type { JarMovement } from "@jarso/core/ledger";
import { sumDueOccurrences } from "@jarso/data/allowance";
import type { FamilyContext } from "@jarso/data/family";
import { listMovementsSince, localDate } from "@jarso/data/ledger";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "@/features/auth";
import { addDays } from "@/lib";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** Pocket money waiting for a parent to hand over, or null if it can't be read (Home goes on). */
export function useAllowanceDue(): { totalMinor: number; count: number } | null {
  const { userId } = useSession();
  const due = useQuery({
    queryKey: keys.allowanceDue(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => sumDueOccurrences(supabase, userId as string),
  });
  return due.data ?? null;
}

/**
 * The last week's jar movements as local days, for Jarso's line. Null while loading or if the
 * read fails: the hero then says a plain hello.
 */
export function useHomeWeek(context: FamilyContext | undefined): JarMovement[] | null {
  const { userId } = useSession();
  const week = useQuery({
    queryKey: keys.homeWeek(userId ?? ""),
    enabled: Boolean(userId && context),
    queryFn: () => {
      const from = addDays((context as FamilyContext).today, -6);
      // A day earlier than `from` in UTC covers every timezone's start of that day.
      return listMovementsSince(supabase, userId as string, `${addDays(from, -1)}T00:00:00Z`);
    },
  });
  return useMemo(
    () =>
      week.data?.map((row) => ({
        jar: row.jar,
        direction: row.direction,
        amountMinor: row.amountMinor,
        occurredOn: localDate(row.occurredAt, context?.timezone ?? "UTC"),
      })) ?? null,
    [week.data, context?.timezone],
  );
}
