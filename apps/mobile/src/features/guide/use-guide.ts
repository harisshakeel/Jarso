import {
  deleteMemory,
  getMyTranscript,
  listMemories,
  listMyChats,
  rateMessage,
} from "@jarso/data/guide";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

// Every read here goes through @jarso/data/guide, which only returns the child's own chats
// (`asked_by is null`): a parent's chat about the child never reaches the phone.

/** The child's own chats, newest first. */
export function useMyChats() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.chats(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => listMyChats(supabase, userId as string),
  });
}

/** One of the child's own chats, to pick up again. Null when it isn't theirs or is gone. */
export function useTranscript(conversationId: string | null) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.transcript(userId ?? "", conversationId ?? ""),
    enabled: Boolean(userId && conversationId),
    gcTime: 0,
    queryFn: () => getMyTranscript(supabase, userId as string, conversationId as string),
  });
}

/** The memories' key: the child's own (Me), or one child's as their parent reads them. */
function useMemoriesKey(childId?: string) {
  const { userId } = useSession();
  return {
    queryKey: childId ? keys.childMemories(childId) : keys.memories(userId ?? ""),
    whose: childId ?? userId,
  };
}

/**
 * What Jarso remembers about the child (shown in Me, each with Forget). With `childId`: one of
 * the parent's children (RLS lets their parent read and delete them too).
 */
export function useMemories(childId?: string) {
  const { queryKey, whose } = useMemoriesKey(childId);
  return useQuery({
    queryKey,
    enabled: Boolean(whose),
    queryFn: () => listMemories(supabase, whose as string),
  });
}

/** Forgets one memory (RLS: the child's own, or their parent), then refreshes the list. */
export function useForgetMemory(childId?: string) {
  const { queryKey } = useMemoriesKey(childId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memoryId: string) => deleteMemory(supabase, memoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
}

/** Thumbs up or down on one of Jarso's replies (`rate_guide_message` checks it's the child's). */
export function useRateMessage() {
  return useMutation({
    mutationFn: ({ messageId, rating }: { messageId: string; rating: 1 | -1 }) =>
      rateMessage(supabase, messageId, rating),
  });
}
