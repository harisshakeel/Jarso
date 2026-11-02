import { BotIcon, CalendarCheckIcon, ChevronRightIcon, GraduationCapIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";
import type { WeekMoney } from "../types";

export type ChildWeek = {
  nickname: string;
  money: WeekMoney;
  learning: {
    daysThisWeek: number;
    missionsDone: number;
    /** The mission the child is on, or null when every mission is done. */
    current: { day: number; title: string } | null;
  };
  /** Jarso chats this week and how many of them are flagged; null when Jarso is off. */
  chats: { count: number; flagged: number } | null;
};

/** The child's money week as a parent reads it: in, out, saved, in one plain sentence. */
export function parentWeekSentence(
  nickname: string,
  week: WeekMoney,
  money: (minor: number) => string,
): string {
  const parts: string[] = [];
  if (week.receivedMinor > 0) parts.push(`got ${money(week.receivedMinor)}`);
  if (week.spentMinor > 0) parts.push(`spent ${money(week.spentMinor)}`);
  if (week.savedMinor > 0) parts.push(`put ${money(week.savedMinor)} into Save`);
  if (week.savedMinor < 0) parts.push(`took ${money(-week.savedMinor)} out of Save`);
  if (parts.length === 0) return `No money moved for ${nickname} this week.`;
  const last = parts.pop();
  const body = parts.length ? `${parts.join(", ")} and ${last}` : last;
  return `${nickname} ${body} this week.`;
}

/** One line about learning: days, missions, and where the child is on the road. */
export function parentLearningLine(learning: ChildWeek["learning"]): string {
  const days =
    learning.daysThisWeek === 0
      ? "No learning days yet this week"
      : `${learning.daysThisWeek} learning ${learning.daysThisWeek === 1 ? "day" : "days"} this week`;
  const done = `${learning.missionsDone} ${learning.missionsDone === 1 ? "mission" : "missions"} done`;
  const next = learning.current
    ? `Next: Day ${learning.current.day}, ${learning.current.title}.`
    : "Every mission is done.";
  return `${days}, ${done}. ${next}`;
}

/** One line about Jarso: how many chats, and whether any need a look. */
export function parentChatsLine(nickname: string, chats: ChildWeek["chats"]): string | null {
  if (!chats) return null;
  if (chats.count === 0) return `${nickname} hasn't chatted with Jarso this week.`;
  const count = `${chats.count} ${chats.count === 1 ? "chat" : "chats"} with Jarso this week`;
  return chats.flagged > 0
    ? `${count}, ${chats.flagged} worth a look.`
    : `${count}, nothing flagged.`;
}

/**
 * A child's week on the parent's Home (design.md §10): money, learning and Jarso as three
 * sentences with a link into each, never a grid of numbers.
 */
export function ChildWeekCard({
  week,
  currency,
  hrefs,
}: {
  week: ChildWeek;
  currency: string;
  hrefs: { money: Route; learning: Route; jarso: Route };
}) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "always" });
  const chats = parentChatsLine(week.nickname, week.chats);
  const rows = [
    {
      icon: CalendarCheckIcon,
      text: parentWeekSentence(week.nickname, week.money, money),
      href: hrefs.money,
    },
    { icon: GraduationCapIcon, text: parentLearningLine(week.learning), href: hrefs.learning },
    ...(chats ? [{ icon: BotIcon, text: chats, href: hrefs.jarso }] : []),
  ];
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-label={`${week.nickname}'s week`} className="grid gap-3">
          <h3 className="text-h3">{week.nickname}'s week</h3>
          <ul className="grid gap-2">
            {rows.map(({ icon: Icon, text, href }) => (
              <li key={text}>
                <Link
                  href={href}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="flex-1">{text}</span>
                  <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
