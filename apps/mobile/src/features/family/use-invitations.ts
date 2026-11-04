import type {
  AcceptInvitationInput,
  AcceptListedInvitationInput,
  ChildSummary,
} from "@jarso/core/family";
import { listInvitationsForCaller } from "@jarso/data/family";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";
import { useChildJoined } from "./use-family-mutations";

/** Invitations children sent to this parent's email (`list_my_invitations`), newest first. */
export function useInvitations() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.invitations(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => listInvitationsForCaller(supabase),
  });
}

/**
 * The child's nickname behind a link token or code, once per invite: the route is rate-limited
 * (10 an hour), so it is never retried or refetched on its own. Unknown, expired and used
 * invitations are all a NOT_FOUND with the same message.
 */
export function useInvitationLookup(invite: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.invitationLookup(userId ?? "", invite ?? ""),
    enabled: Boolean(userId && invite),
    queryFn: () =>
      apiFetch<{ nickname: string }>("/api/v1/invitations/lookup", {
        method: "POST",
        body: { invite },
        auth: true,
      }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Accepts by link or code (`invite`) or from the parent's list (`invitationId`): the server route. */
export function useAcceptInvitation() {
  const { userId } = useSession();
  const client = useQueryClient();
  const joined = useChildJoined();
  return useMutation({
    mutationFn: (input: AcceptInvitationInput | AcceptListedInvitationInput) =>
      apiFetch<ChildSummary>("/api/v1/invitations", { method: "POST", body: input, auth: true }),
    onSuccess: (child) => {
      joined(child);
      // Exact: the lookups share the prefix and must not run again (rate-limited, now used up).
      void client.invalidateQueries({ queryKey: keys.invitations(userId ?? ""), exact: true });
    },
  });
}
