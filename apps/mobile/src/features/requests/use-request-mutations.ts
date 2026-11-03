import type { DepositResult, EmergencyResult, WithdrawalResult } from "@jarso/core/requests";
import {
  type Client,
  callCreateDeposit,
  callCreateEmergency,
  callCreateWithdrawal,
} from "@jarso/data/requests";
import { findChildRules } from "@jarso/data/rules";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSession } from "@/features/auth";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** What a sheet sends: the call's input, less the child (the session's own id). */
type Input<T extends (db: Client, input: never) => unknown> = Omit<Parameters<T>[1], "childId">;

/**
 * One mutation per request kind. `sent` says whether the server took the request: a refusal
 * (`over_available`, `over_cap`) resolves too, but nothing was asked, so nothing refreshes or
 * dispatches. On a sent request: refresh Home, Requests, History and the goal (a move in or out
 * of Save changes its climb), tell the parent, a haptic.
 */
function useSendRequest<V, R>(
  call: (db: Client, input: V & { childId: string }) => Promise<R>,
  sent: (result: R) => boolean,
) {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: V) => call(supabase, { ...input, childId: userId as string }),
    onSuccess: (result) => {
      if (!sent(result)) return;
      const id = userId as string;
      void queryClient.invalidateQueries({ queryKey: keys.home(id) });
      void queryClient.invalidateQueries({ queryKey: keys.requests(id) });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
      void queryClient.invalidateQueries({ queryKey: keys.goal(id) });
      dispatchNotices();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  });
}

/** Put money into Save. `over_available` is the only refusal. */
export function useCreateDeposit() {
  return useSendRequest<Input<typeof callCreateDeposit>, DepositResult>(
    callCreateDeposit,
    (result) => result.status !== "over_available",
  );
}

/** Take money out of Save. Refused as `over_available` or `over_cap`. */
export function useCreateWithdrawal() {
  return useSendRequest<Input<typeof callCreateWithdrawal>, WithdrawalResult>(
    callCreateWithdrawal,
    (result) => result.status !== "over_available" && result.status !== "over_cap",
  );
}

/** Ask for extra money. Always sent: only a parent decides. */
export function useCreateEmergency() {
  return useSendRequest<Input<typeof callCreateEmergency>, EmergencyResult>(
    callCreateEmergency,
    () => true,
  );
}

/** The child's rules, for the plain-words lines in the Save sheets. Nice to have, never blocking. */
export function useChildRules() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.rules(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => findChildRules(supabase, userId as string),
  });
}
