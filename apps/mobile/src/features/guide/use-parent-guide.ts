import type { ActionDraft, ActionOutcome } from "@jarso/core/guide";
import {
  getAskerTranscript,
  getChildTranscript,
  listChatsAskedBy,
  listChildChats,
  saveGuideAccess,
} from "@jarso/data/guide";
import { type QueryKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { apiFetch } from "@/lib/api";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

// The parent's side of the guide. Their own chats are read by asker (`asked_by` is the parent);
// a child's chats only through the child's own reads, which never include a parent's chat.

/** Refreshes the given reads after a write. */
function useRefresh() {
  const client = useQueryClient();
  return (...queryKeys: QueryKey[]) => {
    for (const queryKey of queryKeys) void client.invalidateQueries({ queryKey });
  };
}

/** The parent's own chats about their children, newest first. */
export function useParentChats() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.parentChats(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => listChatsAskedBy(supabase, userId as string),
  });
}

/** One of the parent's own chats, to pick up again. Null when someone else asked it. */
export function useParentTranscript(conversationId: string | null) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.parentTranscript(userId ?? "", conversationId ?? ""),
    enabled: Boolean(userId && conversationId),
    gcTime: 0,
    queryFn: () => getAskerTranscript(supabase, userId as string, conversationId as string),
  });
}

/** The child's own chats as their parent reads them, flagged first, then newest. */
export function useChildChats(childId: string) {
  return useQuery({
    queryKey: keys.childChats(childId),
    queryFn: () => listChildChats(supabase, childId),
  });
}

/** One of the child's chats. Null when it is not this child's or has no turns. */
export function useChildTranscript(childId: string, conversationId: string) {
  return useQuery({
    queryKey: keys.childTranscript(childId, conversationId),
    queryFn: () => getChildTranscript(supabase, childId, conversationId),
  });
}

/** Jarso on or off for one child (`set_guide_access` checks the parent). */
export function useSetGuideAccess() {
  const { userId } = useSession();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ childId, enabled }: { childId: string; enabled: boolean }) =>
      saveGuideAccess(supabase, childId, enabled),
    onSettled: (_result, _error, { childId }) =>
      refresh(keys.parentGuide(userId ?? ""), keys.childGuideAccess(childId)),
  });
}

/**
 * "Do it" on an action Jarso prepared: the draft goes to the server as it is (its id keeps a
 * repeat from recording twice), which runs it through the app's own service and says what
 * happened. The child's money and the family's reads refresh, and any notice it left is pushed.
 */
export function useConfirmDraft(childId: string) {
  const { userId } = useSession();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (draft: ActionDraft) =>
      apiFetch<ActionOutcome>("/api/v1/guide/drafts/confirm", {
        method: "POST",
        body: { draft },
        auth: true,
      }),
    onSuccess: (_outcome, draft) => {
      refresh(keys.family(userId ?? ""), keys.child("childId" in draft ? draft.childId : childId));
      dispatchNotices();
    },
  });
}
