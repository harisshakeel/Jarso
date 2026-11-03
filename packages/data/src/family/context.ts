import { AppError, familyToday } from "@jarso/core/lib";
import { type Client, findFamilyById, findMembership } from "./repository";

export type FamilyContext = { currency: string; timezone: string; today: string };

/** A user's family currency and local today, for schemas and default dates. */
export async function getFamilyContext(
  db: Client,
  userId: string,
  now?: Date,
): Promise<FamilyContext> {
  const membership = await findMembership(db, userId);
  const family = membership ? await findFamilyById(db, membership.familyId) : null;
  if (!family) throw new AppError("FORBIDDEN", "Set up your family first.");
  return {
    currency: family.currency,
    timezone: family.timezone,
    today: familyToday(family.timezone, now),
  };
}
