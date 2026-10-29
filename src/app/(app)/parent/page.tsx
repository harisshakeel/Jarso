import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { JarsoMark } from "@/components/brand";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import {
  type ChildDueItem,
  ChildOverviewCard,
  type DueItem,
  NeedsYou,
  type Schedule,
} from "@/features/allowance";
import { getSchedule, listDue } from "@/features/allowance/server";
import type { ChildSummary } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import type { JarBalances } from "@/features/ledger";
import { getJars } from "@/features/ledger/server";

export const metadata: Metadata = { title: "Your family" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

/** One child's reads, started together and awaited where each section needs them. */
type ChildReads = {
  child: ChildSummary;
  due: Promise<DueItem[]>;
  jars: Promise<JarBalances>;
  schedule: Promise<Schedule | null>;
};

async function ParentHome() {
  const { membership } = await requireRole("parent", routes.parent);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);

  if (children.length === 0) return <FirstChildCard />;

  // Each service runs once per child; "Needs you" and each card stream in as their reads land.
  const reads: ChildReads[] = children.map((child) => ({
    child,
    due: listDue(child.id),
    jars: getJars(child.id),
    schedule: getSchedule(child.id),
  }));

  return (
    <>
      <div className="rise-in">
        <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
          <NeedsYouSection reads={reads} currency={family.currency} />
        </Suspense>
      </div>
      <section aria-labelledby="children-title" className="rise-in grid gap-3" style={rise(1)}>
        <h2 id="children-title" className="text-h2">
          Children
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {reads.map((read) => (
            <li key={read.child.id}>
              <Suspense fallback={<div aria-hidden className="shimmer h-36 rounded-xl bg-muted" />}>
                <ChildCard read={read} currency={family.currency} />
              </Suspense>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <Link
            href={routes.parentNewChild}
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
          >
            <PlusIcon aria-hidden className="size-4" />
            Add a child
          </Link>
          <span aria-hidden className="px-2 text-muted-foreground">
            ·
          </span>
          <Link
            href={routes.invite}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
          >
            Accept an invitation
          </Link>
        </p>
      </section>
    </>
  );
}

/** Everything due across the family, oldest first. */
async function NeedsYouSection({ reads, currency }: { reads: ChildReads[]; currency: string }) {
  const perChild = await Promise.all(
    reads.map(
      async ({ child, due }): Promise<ChildDueItem[]> =>
        (await due).map((item) => ({ ...item, childId: child.id, nickname: child.nickname })),
    ),
  );
  const items = perChild.flat().sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  return <NeedsYou items={items} currency={currency} />;
}

async function ChildCard({ read, currency }: { read: ChildReads; currency: string }) {
  const [due, jars, schedule] = await Promise.all([read.due, read.jars, read.schedule]);
  return (
    <ChildOverviewCard
      childId={read.child.id}
      nickname={read.child.nickname}
      spendMinor={jars.spend}
      saveMinor={jars.save}
      schedule={schedule}
      dueCount={due.length}
      currency={currency}
    />
  );
}

/** design.md §6 Empty state: mark, one sentence, one action. It is the next step, so it leads. */
function FirstChildCard() {
  return (
    <Card className="rise-in shadow-raised">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <JarsoMark size={64} />
        <p className="text-h3">Add your first child to get started.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={routes.parentNewChild} className={buttonVariants({ size: "lg" })}>
            <PlusIcon aria-hidden />
            Add a child
          </Link>
          <Link href={routes.invite} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Accept an invitation
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-32 rounded-xl bg-muted" />
      <div className="shimmer h-8 w-40 rounded-lg bg-muted" />
      <div className="shimmer h-36 rounded-xl bg-muted" />
    </div>
  );
}

export default function ParentHomePage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <h1 className="text-h1">Your family</h1>
      <Suspense fallback={<HomeSkeleton />}>
        <ParentHome />
      </Suspense>
    </div>
  );
}
