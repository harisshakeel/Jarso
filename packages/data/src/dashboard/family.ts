import {
  type DashboardChild,
  type FamilyDashboard,
  periodOf,
  slotFor,
  windowFor,
} from "@jarso/core/dashboard";
import { addDays, familyToday, logger, startOfWeek } from "@jarso/core/lib";
import { getParentSchedule, listDueForParent, listGiftsFor } from "../allowance";
import { type Client, findFamilyById, findMembership, listChildMembers } from "../family";
import { getGoalView } from "../goals";
import { listChildChats } from "../guide";
import { getBalanceHistory, getHistorySince } from "../ledger";
import { getAvailability } from "../requests";

/** A read that is nice to have: if it fails, use `value` and log, so the page still builds. */
async function fallback<T>(read: Promise<T>, value: T, label: string): Promise<T> {
  try {
    return await read;
  } catch (error) {
    logger.warn(`${label} unavailable`, {
      error: error instanceof Error ? error.name : typeof error,
    });
    return value;
  }
}

/**
 * The parent's dashboard reads (spec 2026-11-02): every child of the family once, in parallel,
 * for the period asked and the one before it. The jars and what's due are needed; every other
 * read is a nice-to-have, so a failed one leaves its section a little emptier, never the page.
 * Null without a family. No auth here: the caller checks `userId` is a parent, and RLS limits
 * every read to their own children.
 */
export async function getFamilyDashboard(
  db: Client,
  opts: { userId: string; days: number; now: Date; guideOn: boolean },
): Promise<FamilyDashboard | null> {
  const { userId, days, now, guideOn } = opts;
  const membership = await findMembership(db, userId);
  if (!membership) return null;
  const [family, children] = await Promise.all([
    findFamilyById(db, membership.familyId),
    listChildMembers(db, membership.familyId),
  ]);
  if (!family) return null;
  const { timezone } = family;
  const today = familyToday(timezone, now);
  const window = windowFor(periodOf(days).days, today);
  // Back to the start of the period before, and at least to Monday for this week's handovers.
  const weekStart = startOfWeek(today);
  const since = [window.prevFrom, weekStart].sort()[0] ?? weekStart;
  const read = await Promise.all(
    children.map(async (child, index): Promise<DashboardChild> => {
      const [availability, due, goal, schedule, gifts, history, balances, chats] =
        await Promise.all([
          getAvailability(db, child.id),
          listDueForParent(db, child.id),
          fallback(getGoalView(db, child.id), null, "Goal on the dashboard"),
          fallback(getParentSchedule(db, child.id, userId), null, "Schedule on the dashboard"),
          fallback(listGiftsFor(db, child.id, userId), [], "Gifts on the dashboard"),
          fallback(
            getHistorySince(db, child.id, addDays(since, -1), { timezone, now: now.getTime() }),
            [],
            "History on the dashboard",
          ),
          fallback(
            getBalanceHistory(db, child.id, { timezone, now }),
            null,
            "Balances on the dashboard",
          ),
          guideOn ? fallback(listChildChats(db, child.id), [], "Chats on the dashboard") : [],
        ]);
      return {
        id: child.id,
        nickname: child.nickname,
        slot: slotFor(index),
        spendMinor: availability.spendMinor,
        saveMinor: availability.saveMinor,
        reservedMinor: availability.reservedSaveMinor,
        goal,
        schedule,
        due,
        gifts,
        history,
        balances,
        flaggedChats: chats.filter(
          (chat) => chat.flagged && chat.lastMessageAt.slice(0, 10) >= weekStart,
        ).length,
      };
    }),
  );
  return { currency: family.currency, timezone, today, children: read };
}
