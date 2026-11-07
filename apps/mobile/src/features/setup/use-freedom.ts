import { type FreedomPreset, freedomWrites } from "@jarso/core/rules";
import { saveJarMovesApproval, saveMoneyRule } from "@jarso/data/rules";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * Applies a freedom preset to a new child through the rules' own functions (`set_money_rule`,
 * `set_jar_moves_approval`, each checks the parent). "Ask me every time" writes nothing. One
 * write at a time, so a refusal stops before the next.
 */
export function useApplyFreedom(childId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ preset, capMinor }: { preset: FreedomPreset; capMinor: number }) => {
      const writes = freedomWrites(preset, capMinor);
      for (const rule of writes.rules) {
        await saveMoneyRule(supabase, { childId, ...rule });
      }
      if (writes.jarMoves) await saveJarMovesApproval(supabase, childId, writes.jarMoves);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: keys.childRules(childId) }),
  });
}
