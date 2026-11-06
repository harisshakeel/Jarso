import { type BalanceHistory, balanceHistory, type Jars } from "@jarso/core/ledger";
import type { FamilyContext } from "@jarso/data/family";
import { listMovementsSince, localDate } from "@jarso/data/ledger";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "@/features/auth";
import { addDays } from "@/lib";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** Days of history read: covers the jar page's six weeks and the graph's longest period. */
const GRAPH_DAYS = 90;

/**
 * Where both jars stood at the end of each of the last 90 days, ending at Home's balances: one
 * read of the movements, then core's walk-back (the web's `getBalanceHistory`).
 */
export function useBalanceHistory(jars: Jars, context: FamilyContext) {
  const { userId } = useSession();
  const movements = useQuery({
    queryKey: keys.balance(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => {
      const from = addDays(context.today, -(GRAPH_DAYS - 1));
      // A day earlier than `from` in UTC covers every timezone's start of that day.
      return listMovementsSince(supabase, userId as string, `${addDays(from, -1)}T00:00:00Z`);
    },
  });
  const data = useMemo<BalanceHistory | undefined>(() => {
    if (!movements.data) return undefined;
    const from = addDays(context.today, -(GRAPH_DAYS - 1));
    const rows = movements.data.map((row) => ({
      jar: row.jar,
      direction: row.direction,
      amountMinor: row.amountMinor,
      occurredOn: localDate(row.occurredAt, context.timezone),
    }));
    return balanceHistory(jars, rows, from, context.today);
  }, [movements.data, jars, context]);
  return { data, error: movements.error, refetch: movements.refetch };
}
