import type { JarMovesMode, Period, RuleKind } from "@jarso/core/rules";
import {
  findChildRules,
  saveAllowNegativeSpend,
  saveJarMovesApproval,
  saveMoneyRule,
} from "@jarso/data/rules";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** A child's money rules, jar-move mode and overspend setting (RLS: the child or a parent). */
export function useChildRules(childId: string) {
  return useQuery({
    queryKey: keys.childRules(childId),
    queryFn: () => findChildRules(supabase, childId),
  });
}

/** After a rules write: read the rules again and let the server send what is waiting. */
function useAfterSave(childId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.childRules(childId) });
    dispatchNotices();
  };
}

/** Set or clear one rule (`set_money_rule` checks the parent; `amountMinor: null` clears it). */
export function useSaveRule(childId: string) {
  const after = useAfterSave(childId);
  return useMutation({
    mutationFn: (input: {
      childId: string;
      kind: RuleKind;
      period: Period;
      amountMinor: number | null;
    }) => saveMoneyRule(supabase, input),
    onSuccess: after,
  });
}

/** Ask first or just tell (`set_jar_moves_approval`). */
export function useSaveJarMoves(childId: string) {
  const after = useAfterSave(childId);
  return useMutation({
    mutationFn: (mode: JarMovesMode) => saveJarMovesApproval(supabase, childId, mode),
    onSuccess: after,
  });
}

/** Whether Spend may go below zero (`set_allow_negative_spend`). */
export function useSaveOverspend(childId: string) {
  const after = useAfterSave(childId);
  return useMutation({
    mutationFn: (allowed: boolean) => saveAllowNegativeSpend(supabase, childId, allowed),
    onSuccess: after,
  });
}
