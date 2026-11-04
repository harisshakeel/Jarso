import type {
  AllowanceInput,
  ChangeAllowanceInput,
  GiftInput,
  PauseInput,
  UpdateGiftInput,
} from "@jarso/core/allowance";
import {
  cancelGift,
  changeAllowance,
  createAllowance,
  createGift,
  findGift,
  pauseAllowance,
  resumeAllowance,
  stopAllowance,
  updateGift,
} from "@jarso/data/allowance";
import { getFamilyContext } from "@jarso/data/family";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { isAppError } from "@/lib";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** The family's currency and local today, for the allowance and gift schemas. */
export function useFamilyContext() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.familyContext(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => getFamilyContext(supabase, userId as string),
    staleTime: 5 * 60_000,
  });
}

/**
 * An allowance or gift write. The child's pages and the family's reads refresh after it (after a
 * CONFLICT too: the schedule or gift changed under the parent, so show it as it is now); a write
 * that went through lets the server send what is waiting.
 */
function useAllowanceWrite<V extends { childId: string }, R>(call: (input: V) => Promise<R>) {
  const { userId } = useSession();
  const client = useQueryClient();
  const refresh = (childId: string) => {
    void client.invalidateQueries({ queryKey: keys.child(childId) });
    void client.invalidateQueries({ queryKey: keys.family(userId ?? "") });
  };
  return useMutation({
    mutationFn: call,
    onSuccess: (_result, input) => {
      refresh(input.childId);
      dispatchNotices();
    },
    onError: (error, input) => {
      if (isAppError(error) && error.code === "CONFLICT") refresh(input.childId);
    },
  });
}

type ForChild<T> = T & { childId: string };

/** Sets up an allowance (`alreadyExists` when one is running). */
export function useCreateAllowance() {
  return useAllowanceWrite((input: AllowanceInput) => createAllowance(supabase, input));
}

/** Changes the amount, how often and the next date (a refused date lands on `nextOn`). */
export function useChangeAllowance() {
  return useAllowanceWrite(({ childId: _childId, ...input }: ForChild<ChangeAllowanceInput>) =>
    changeAllowance(supabase, input),
  );
}

/** Pauses until a date (`through`) or until a parent resumes it (`through: null`). */
export function usePauseAllowance() {
  return useAllowanceWrite(({ childId: _childId, ...input }: ForChild<PauseInput>) =>
    pauseAllowance(supabase, input),
  );
}

export function useResumeAllowance() {
  return useAllowanceWrite(({ scheduleId }: { childId: string; scheduleId: string }) =>
    resumeAllowance(supabase, scheduleId),
  );
}

export function useStopAllowance() {
  return useAllowanceWrite(({ scheduleId }: { childId: string; scheduleId: string }) =>
    stopAllowance(supabase, scheduleId),
  );
}

/**
 * A new gift; the opening's idempotency key makes a re-send one gift. Returns the day the stored
 * gift is given on: a re-send returns the gift the lost reply made, which keeps its first date.
 * `giveOn` is null when that read fails: the gift is saved all the same, so the save still
 * succeeds, and no date is guessed.
 */
export function useCreateGift() {
  return useAllowanceWrite(async (input: GiftInput) => {
    const giftId = await createGift(supabase, input);
    const gift = await findGift(supabase, giftId).catch(() => null);
    return { giftId, giveOn: gift?.giveOn ?? null };
  });
}

/** Changes a pending gift. `today` lets a due gift keep its past date. */
export function useUpdateGift() {
  return useAllowanceWrite(
    ({ childId: _childId, today, ...input }: ForChild<UpdateGiftInput & { today: string }>) =>
      updateGift(supabase, input, today),
  );
}

export function useCancelGift() {
  return useAllowanceWrite(({ giftId }: { childId: string; giftId: string }) =>
    cancelGift(supabase, giftId),
  );
}
