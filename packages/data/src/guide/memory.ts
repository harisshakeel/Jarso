import { type Memory, type MemoryKind, memoryKinds } from "@jarso/core/guide";
import { toAppError } from "@jarso/core/lib";
import type { Client } from "./repository";

// The guide_memories reads and deletes, with the caller's client (RLS: the child or their
// parents). The write goes through `guide_remember` with the admin client and stays on the server.

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
