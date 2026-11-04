import type { AddChildInput, ChildSummary } from "@jarso/core/family";
import { renameChildMember, updateFamilyTimezone } from "@jarso/data/family";
import { updateProfileById } from "@jarso/data/profiles";
import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";
import type { FamilyData } from "./use-family";

/** Refreshes the given reads after a settings write. */
function useRefresh() {
  const client = useQueryClient();
  return (...queryKeys: QueryKey[]) => {
    for (const queryKey of queryKeys) void client.invalidateQueries({ queryKey });
  };
}

/**
 * After a child joins (added, or an invitation accepted): the child goes into the cached family
 * at once, so their hub opens before the refetch lands, then every family read refreshes.
 */
export function useChildJoined() {
  const { userId } = useSession();
  const client = useQueryClient();
  return (child: ChildSummary) => {
    const familyKey = keys.family(userId ?? "");
    client.setQueryData<FamilyData>(familyKey, (old) =>
      old && !old.children.some((item) => item.id === child.id)
        ? { ...old, children: [...old.children, child] }
        : old,
    );
    for (const queryKey of [familyKey, keys.parentGuide(userId ?? "")]) {
      void client.invalidateQueries({ queryKey });
    }
  };
}

/** Adds a child to the parent's own family: the server route (admin client for the child's login). */
export function useAddChild() {
  const joined = useChildJoined();
  return useMutation({
    mutationFn: (input: AddChildInput) =>
      apiFetch<ChildSummary>("/api/v1/children", { method: "POST", body: input, auth: true }),
    onSuccess: joined,
  });
}

/** The parent's display name (`profiles.full_name`, RLS: owner only). */
export function useSaveDisplayName() {
  const { userId } = useSession();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (fullName: string) =>
      updateProfileById(supabase, userId as string, { full_name: fullName }),
    onSuccess: () => refresh(keys.profile(userId ?? "")),
  });
}

/** The family's timezone (`update_family_timezone` checks the parent and the zone). */
export function useUpdateTimezone() {
  const { userId } = useSession();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (timezone: string) => updateFamilyTimezone(supabase, timezone),
    onSuccess: () => refresh(keys.family(userId ?? "")),
  });
}

/** A child's nickname (`rename_child`; a nickname taken in the family is a CONFLICT). */
export function useRenameChild() {
  const { userId } = useSession();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ childId, nickname }: { childId: string; nickname: string }) =>
      renameChildMember(supabase, childId, nickname),
    onSuccess: (_result, { childId }) => refresh(keys.family(userId ?? ""), keys.child(childId)),
  });
}

/** A new PIN for a child: the server route (admin client; every device of the child signs out). */
export function useSetChildPin() {
  return useMutation({
    mutationFn: ({ childId, pin }: { childId: string; pin: string }) =>
      apiFetch<{ ok: true }>(`/api/v1/children/${childId}/pin`, {
        method: "PATCH",
        body: { pin },
        auth: true,
      }),
  });
}

/** Removes a child from the family: the server route (admin client, ADR 0007). */
export function useRemoveChild() {
  const { userId } = useSession();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (childId: string) =>
      apiFetch<{ ok: true }>(`/api/v1/children/${childId}`, { method: "DELETE", auth: true }),
    onSuccess: (_result, childId) =>
      refresh(keys.family(userId ?? ""), keys.child(childId), keys.parentGuide(userId ?? "")),
  });
}
