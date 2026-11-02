import "server-only";
import { createAdminClient } from "./admin";

/**
 * The deep health probe: one cheap read that proves the database answers. It counts no rows
 * and returns no data (a head request), through the admin client because the anonymous role
 * has no grant on any table (family_core revoked it), so an anonymous read always "failed"
 * and the probe reported the database unreachable while it was fine. The one query outside a
 * repository, because it is about the connection, not a record.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from("families")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}
