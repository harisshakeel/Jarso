import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { AllowanceBrief } from "@/features/allowance";
import { getSchedule, listDue } from "@/features/allowance/server";
import {
  ChildCard,
  goalPlace,
  learningCardCopy,
  parentPageCopy,
  slotFor,
} from "@/features/dashboard";
import { FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { getGoalView } from "@/features/goals/server";
import { getLearningOverview } from "@/features/learning/server";
import { getJars } from "@/features/ledger/server";
import { SendNoteSheet } from "@/features/notifications";
import { fallback, familyToday, logger } from "@/lib";

export const metadata: Metadata = { title: "Children" };

/**
 * Children (2026-11-05): one card per child, their kid and name, then Learning (where they are
 * on the seven missions, the week, skills, practice, recent lessons) and Money (Spend, Save, the
 * goal, and the allowance with Manage, moved here from Money). Any part that can't be read says
 * so in its place; the card stays.
 */
async function ChildrenContent() {
  const { membership } = await requireRole("parent", routes.parentChildren);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);
  if (children.length === 0) return <FirstChildCard />;
  const today = familyToday(family.timezone);

  const cards = await Promise.all(
    children.map(async (child, index) => {
      const who = { childId: child.id, nickname: child.nickname, slot: slotFor(index) };
      const [learning, jars, goal, schedule, due] = await Promise.all([
        getLearningOverview(child.id).catch((error: unknown) => {
          unstable_rethrow(error);
          logger.warn("Learning unavailable on children page", {
            error: error instanceof Error ? error.name : typeof error,
          });
          return null;
        }),
        fallback(getJars(child.id), null, "Jars on children page"),
        fallback(getGoalView(child.id), null, "Goal on children page"),
        fallback(getSchedule(child.id), null, "Allowance on children page"),
        fallback(listDue(child.id), [], "Dues on children page"),
      ]);
      return {
        who,
        learning,
        jars,
        goal: goalPlace(who, goal).goal,
        schedule,
        dueCount: due.length,
      };
    }),
  );

  return (
    <ul className="grid gap-5 lg:grid-cols-2 lg:items-start">
      {cards.map(({ who, learning, jars, goal, schedule, dueCount }) => (
        <li key={who.childId} className="rise-in">
          <ChildCard
            child={who}
            learning={learning}
            jars={jars}
            goal={goal}
            today={today}
            currency={family.currency}
            allowance={
              <AllowanceBrief
                childId={who.childId}
                nickname={who.nickname}
                schedule={schedule}
                dueCount={dueCount}
                currency={family.currency}
              />
            }
            actions={<SendNoteSheet childId={who.childId} nickname={who.nickname} />}
          />
        </li>
      ))}
    </ul>
  );
}

export default function ChildrenPage() {
  return (
    <PageContainer width="wide" className="gap-6">
      <PageHeader title={parentPageCopy.children} description={learningCardCopy.childrenIntro} />
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="grid gap-5 lg:grid-cols-2">
              <div className="shimmer h-[36rem] rounded-xl bg-muted" />
              <div className="shimmer h-[36rem] rounded-xl bg-muted" />
            </div>
          </SlowFallback>
        }
      >
        <ChildrenContent />
      </Suspense>
    </PageContainer>
  );
}
