import type { ChildSummary } from "@jarso/core/family";
import type { ParentRequestItem } from "@jarso/core/requests";
import {
  callCancel,
  callComplete,
  callDecideDeposit,
  callDecideWithdrawal,
  listOpenRequests,
} from "@jarso/data/requests";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { isAppError, logger } from "@/lib";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** A request waiting on the parent, with the child it belongs to (for refreshing their pages). */
export type FamilyRequestItem = ParentRequestItem & { childId: string };

/**
 * Take-outs, put-ins and asks for extra waiting on the parent, every child's, in the family's
 * child order. A child whose read fails is named in `failed`; the rest still show (the web's
 * `settleRequestReads`).
 */
export function useParentRequests(children: ChildSummary[] | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: [...keys.familyRequests(userId ?? ""), children?.map((child) => child.id)],
    enabled: Boolean(userId) && children !== undefined,
    queryFn: async () => {
      const list = children ?? [];
      const results = await Promise.allSettled(
        list.map((child) => listOpenRequests(supabase, child.id)),
      );
      const items: FamilyRequestItem[] = [];
      const failed: string[] = [];
      results.forEach((result, index) => {
        const child = list[index] as ChildSummary;
        if (result.status === "fulfilled") {
          for (const request of result.value) {
            items.push({ childId: child.id, nickname: child.nickname, request });
          }
        } else {
          logger.warn("Parent requests unavailable", {
            error: result.reason instanceof Error ? result.reason.name : typeof result.reason,
          });
          failed.push(child.nickname);
        }
      });
      return { items, failed };
    },
  });
}

/**
 * One parent decision on a request. Whatever the answer, the child's pages and the family's
 * reads refresh (a CONFLICT too: someone else got there first, so show the row as it is now);
 * a write that went through tells the child.
 */
function useRequestWrite<V extends { childId: string }, R>(
  call: (input: V) => Promise<R>,
  wrote: (result: R) => boolean,
) {
  const { userId } = useSession();
  const client = useQueryClient();
  const refresh = (childId: string) => {
    void client.invalidateQueries({ queryKey: keys.child(childId) });
    void client.invalidateQueries({ queryKey: keys.family(userId ?? "") });
  };
  return useMutation({
    mutationFn: call,
    onSuccess: (result, input) => {
      refresh(input.childId);
      if (wrote(result)) dispatchNotices();
    },
    onError: (error, input) => {
      if (isAppError(error) && error.code === "CONFLICT") refresh(input.childId);
    },
  });
}

/** Approve or say no to a take-out or an ask for extra (`decide_withdrawal`). */
export function useDecideRequest() {
  return useRequestWrite(
    ({ requestId, approve }: { childId: string; requestId: string; approve: boolean }) =>
      callDecideWithdrawal(supabase, { requestId, approve, note: "" }),
    (result) => result === "approved" || result === "rejected",
  );
}

/** The parent handed an approved take-out over, or got a put-in (`complete_request`). */
export function useCompleteRequest() {
  return useRequestWrite(
    ({
      requestId,
      idempotencyKey,
    }: {
      childId: string;
      requestId: string;
      idempotencyKey: string;
    }) => callComplete(supabase, { requestId, idempotencyKey }),
    (result) => result === "completed",
  );
}

/** The parent didn't get the money for a put-in (`decide_deposit`). */
export function useRejectDeposit() {
  return useRequestWrite(
    ({ requestId }: { childId: string; requestId: string }) =>
      callDecideDeposit(supabase, { requestId, note: "" }),
    (result) => result === "rejected",
  );
}

/** The parent didn't hand an approved take-out over: it closes, the money stays in Save. */
export function useCancelHandover() {
  return useRequestWrite(
    ({ requestId }: { childId: string; requestId: string }) => callCancel(supabase, requestId),
    (result) => result === "cancelled",
  );
}
