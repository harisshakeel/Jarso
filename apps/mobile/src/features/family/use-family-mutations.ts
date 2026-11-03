import { renameChildMember, updateFamilyTimezone } from "@jarso/data/family";
import { saveGuideAccess } from "@jarso/data/guide";
import { updateProfileById } from "@jarso/data/profiles";
import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** Refreshes the given reads after a settings write. */
function useRefresh() {
  const client = useQueryClient();
  return (...queryKeys: QueryKey[]) => {
    for (const queryKey of queryKeys) void client.invalidateQueries({ queryKey });
  };
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
