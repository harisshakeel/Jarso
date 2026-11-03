import type { Availability } from "@jarso/core/requests";
import { type Client, fetchBalances, fetchCapRemaining } from "./repository";

/** Jar balances, what is promised, and how much more the child may take out right now. */
export async function getAvailability(db: Client, childId: string): Promise<Availability> {
  const [balances, capRemaining] = await Promise.all([
    fetchBalances(db, childId),
    fetchCapRemaining(db, childId),
  ]);
  return {
    ...balances,
    takeOutLimitMinor:
      capRemaining === null ? null : Math.min(balances.availableSaveMinor, capRemaining),
  };
}
