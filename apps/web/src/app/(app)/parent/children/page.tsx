import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import {
  ChildLearningPanel,
  learningCardCopy,
  parentPageCopy,
  slotFor,
} from "@/features/dashboard";
import { FirstChildCard } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { getLearningOverview } from "@/features/learning/server";
import { SendNoteSheet } from "@/features/notifications";
import { familyToday, logger } from "@/lib";

export const metadata: Metadata = { title: "Children" };

/**
 * Children (learning first since 2026-11-04): one panel per child about how they are learning,
 * the week, skills and practice, and the last three lessons with how each went. Where each child
 * is on the road and the family's jars are on Home; money in detail is the Money tab.
 */
async function ChildrenContent() {
  const { membership } = await requireRole("parent", routes.parentChildren);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);
  if (children.length === 0) return <FirstChildCard />;
  const today = familyToday(family.timezone);

  const panels = await Promise.all(
    children.map(async (child, index) => {
      const learning = await getLearningOverview(child.id).catch((error: unknown) => {
        unstable_rethrow(error);
        logger.warn("Learning unavailable on children page", {
          error: error instanceof Error ? error.name : typeof error,
        });
        return null;
      });
      return { child, slot: slotFor(index), learning };
    }),
  );

  return (
    <ul className="grid gap-5 lg:grid-cols-2 lg:items-start">
      {panels.map(({ child, slot, learning }) => (
        <li key={child.id} className="rise-in">
          {learning ? (
            <ChildLearningPanel
              child={{ childId: child.id, nickname: child.nickname, slot, overview: learning }}
              today={today}
              extra={<SendNoteSheet childId={child.id} nickname={child.nickname} />}
            />
          ) : (
            <p className="rounded-xl bg-card p-5 text-ink-2 shadow-rest">
              <span className="font-bold text-foreground">{child.nickname}</span>
              {": "}
              {learningCardCopy.unavailable}
            </p>
          )}
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
              <div className="shimmer h-80 rounded-xl bg-muted" />
              <div className="shimmer h-80 rounded-xl bg-muted" />
            </div>
          </SlowFallback>
        }
      >
        <ChildrenContent />
      </Suspense>
    </PageContainer>
  );
}
