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

/** What Jarso remembers about the child (shown in Me, each with Forget). */
export function useMemories() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.memories(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => listMemories(supabase, userId as string),
  });
}

/** Forgets one memory (RLS: the child's own), then refreshes the list. */
export function useForgetMemory() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memoryId: string) => deleteMemory(supabase, memoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.memories(userId ?? "") }),
  });
}

/** Thumbs up or down on one of Jarso's replies (`rate_guide_message` checks it's the child's). */
export function useRateMessage() {
  return useMutation({
    mutationFn: ({ messageId, rating }: { messageId: string; rating: 1 | -1 }) =>
      rateMessage(supabase, messageId, rating),
  });
}
