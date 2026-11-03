import type { GuideState } from "@jarso/core/guide";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";

export type { GuideState } from "@jarso/core/guide";

/**
 * Whether the Jarso guide is on for this child (the server decides: family setting, AI key) and
 * whether its intro is still to show. Read through the web's /api/v1/guide/state with the bearer.
 */
export function useGuideState() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.guideState(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => apiFetch<GuideState>("/api/v1/guide/state", { auth: true }),
    staleTime: 5 * 60_000,
  });
}
