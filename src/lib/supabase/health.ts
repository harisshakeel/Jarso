import "server-only";
import { createClient } from "./server";

/**
 * The deep health probe: one cheap, RLS-scoped read as the anonymous role. It proves the
 * database answers; it reads no data (anon sees no rows). The one query outside a repository,
 * because it is about the connection, not a record.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    const db = await createClient();
    const { error } = await db
      .from("families")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}
