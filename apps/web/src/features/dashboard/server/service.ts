import { type DashboardChild, periodOf, slotFor, windowFor } from "@jarso/core/dashboard";
import { getSchedule, listDue, listGifts } from "@/features/allowance/server";
import { getFamily, listChildren } from "@/features/family/server";
import { getGoalView } from "@/features/goals/server";
import { isGuideConfigured, listGuideChats } from "@/features/guide/server";
import { getBalanceHistory, getHistorySince } from "@/features/ledger/server";
import { getAvailability } from "@/features/requests/server";
import { addDays, fallback, familyToday, startOfWeek } from "@/lib";

/** Everything the parent's dashboard shows, read once per child. */
export type FamilyDashboard = {
  currency: string;
  timezone: string;
  today: string;
  /** In the family's child order, each with their fixed colour slot. */
  children: DashboardChild[];
};

/**
 * The parent's dashboard reads (spec 2026-11-02): every child of the family once, in parallel,
 * for the period asked and the one before it. The jars and what's due are needed; every other
 * read is a nice-to-have, so a failed one leaves its section a little emptier, never the page.
 * Null without a family. Each read checks the parent may see the child.
 */
export async function getFamilyDashboard(days: number): Promise<FamilyDashboard | null> {
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) return null;
  const today = familyToday(family.timezone);
  const window = windowFor(periodOf(days).days, today);
  // Back to the start of the period before, and at least to Monday for this week's handovers.
  const weekStart = startOfWeek(today);
  const since = [window.prevFrom, weekStart].sort()[0] ?? weekStart;
  const guideOn = isGuideConfigured();
  const read = await Promise.all(
    children.map(async (child, index): Promise<DashboardChild> => {
      const [availability, due, goal, schedule, gifts, history, balances, chats] =
        await Promise.all([
          getAvailability(child.id),
          listDue(child.id),
          fallback(getGoalView(child.id), null, "Goal on the dashboard"),
          fallback(getSchedule(child.id), null, "Schedule on the dashboard"),
          fallback(listGifts(child.id), [], "Gifts on the dashboard"),
          fallback(getHistorySince(child.id, addDays(since, -1)), [], "History on the dashboard"),
          fallback(getBalanceHistory(child.id), null, "Balances on the dashboard"),
          guideOn ? fallback(listGuideChats(child.id), [], "Chats on the dashboard") : [],
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
  return { currency: family.currency, timezone: family.timezone, today, children: read };
}
