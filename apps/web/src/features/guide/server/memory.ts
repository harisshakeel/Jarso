import "server-only";
import type { MemoryKind } from "@jarso/core/guide";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows the guide_memories table and its function (ADR 0011, slice 8). Reads and
 * deletes use the caller's client (RLS: the child or their parents) and are shared with the phone.
 * The write uses the admin client through `guide_remember`, called by the memory tool after its
 * own checks.
 */
export { deleteMemory, listMemories } from "@jarso/data/guide";

export async function remember(
  admin: Client,
  input: { childId: string; kind: MemoryKind; text: string },
): Promise<string> {
  const { data, error } = await admin.rpc("guide_remember", {
    p_child_id: input.childId,
    p_kind: input.kind,
    p_text: input.text,
  });
  if (error) throw toAppError(error, "Failed to remember that");
  if (!data) throw new AppError("INTERNAL", "Failed to remember that");
  return data;
}
