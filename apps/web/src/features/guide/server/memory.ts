import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import { type Memory, type MemoryKind, memoryKinds } from "../types";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows the guide_memories table and its function (ADR 0011, slice 8). Reads and
 * deletes use the caller's client (RLS: the child or their parents). The write uses the admin
 * client through `guide_remember`, called by the memory tool after its own checks.
 */

const COLUMNS = "id, kind, text, created_at, expires_at";

function toMemory(row: {
  id: string;
  kind: string;
  text: string;
  created_at: string;
  expires_at: string;
}): Memory | null {
  const kind = memoryKinds.find((k) => k === row.kind);
  if (!kind) return null;
  return {
    id: row.id,
    kind: kind as MemoryKind,
    text: row.text,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/** A child's memories, newest first, unexpired. */
export async function listMemories(db: Client, childId: string): Promise<Memory[]> {
  const { data, error } = await db
    .from("guide_memories")
    .select(COLUMNS)
    .eq("child_id", childId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw toAppError(error, "Failed to load what Jarso remembers");
  return data.flatMap((row) => {
    const memory = toMemory(row);
    return memory ? [memory] : [];
  });
}

/** Forgets one memory. RLS keeps it to the child's own or their parents'. */
export async function deleteMemory(db: Client, memoryId: string): Promise<void> {
  const { error } = await db.from("guide_memories").delete().eq("id", memoryId);
  if (error) throw toAppError(error, "Failed to forget that");
}

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
