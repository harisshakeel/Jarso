import type { Jars } from "@jarso/core/ledger";
import { type Client, fetchBalance } from "./repository";

export async function getJars(db: Client, childId: string): Promise<Jars> {
  const [spend, save] = await Promise.all([
    fetchBalance(db, childId, "spend"),
    fetchBalance(db, childId, "save"),
  ]);
  return { spend, save };
}
