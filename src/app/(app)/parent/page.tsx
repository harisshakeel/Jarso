import { PlusIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { JarsoMark } from "@/components/brand";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { type ChildSummary, ChildSwitcher, FamilyCodeCard, SetPinForm } from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";

export const metadata: Metadata = { title: "Your family" };

// The invite page lands in a later slice-1 task; cast until it exists (typedRoutes).
const invite = routes.invite as Route;

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

async function ParentHome() {
  const { membership } = await requireRole("parent", routes.parent);
  if (!membership) redirect(routes.parentSetup);
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  if (!family) redirect(routes.parentSetup);

  if (children.length === 0) {
    return (
      <>
        <FirstChildCard />
        <FamilyCodeCard code={family.code} className="rise-in" style={rise(1)} />
      </>
    );
  }

  return (
    <>
      <FamilyCodeCard code={family.code} raised className="rise-in" />
      <ChildrenSection>{children}</ChildrenSection>
    </>
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
          <Link href={invite} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Accept an invitation
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ChildrenSection({ children }: { children: ChildSummary[] }) {
  return (
    <section aria-labelledby="children-title" className="rise-in grid gap-4" style={rise(1)}>
      <h2 id="children-title" className="text-h2">
        Children
      </h2>
      {children.length > 1 ? <ChildSwitcher>{children}</ChildSwitcher> : null}
      <Card size="sm">
        <ul className="divide-y divide-hairline">
          {children.map((child) => (
            <li
              key={child.id}
              id={`child-${child.id}`}
              className="flex scroll-mt-20 items-center gap-3 px-(--card-spacing) py-3 first:pt-0 last:pb-0"
            >
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-extrabold text-secondary-foreground"
              >
                {child.nickname.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold">{child.nickname}</span>
              <SetPinForm child={child} />
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={routes.parentNewChild}
          className={buttonVariants({ variant: "secondary", size: "lg" })}
        >
          <PlusIcon aria-hidden />
          Add a child
        </Link>
        <Link href={invite} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Accept an invitation
        </Link>
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-44 rounded-xl bg-muted" />
      <div className="shimmer h-8 w-40 rounded-lg bg-muted" />
      <div className="shimmer h-32 rounded-xl bg-muted" />
    </div>
  );
}

export default function ParentHomePage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <h1 className="text-h1">Your family</h1>
      <Suspense fallback={<HomeSkeleton />}>
        <ParentHome />
      </Suspense>
    </div>
  );
}
