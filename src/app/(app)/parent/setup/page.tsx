import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { safeNextPath } from "@/features/auth";
import { CreateFamilyForm } from "@/features/family";
import { requireRole } from "@/features/family/server";

export const metadata: Metadata = { title: "Set up your family" };

async function SetupForm({
  searchParams,
}: {
  searchParams: PageProps<"/parent/setup">["searchParams"];
}) {
  const [{ membership }, { next }] = await Promise.all([
    requireRole("parent", routes.parentSetup),
    searchParams,
  ]);
  const nextPath = typeof next === "string" ? next : undefined;
  if (membership) redirect(safeNextPath(nextPath, routes.parent));
  return <CreateFamilyForm next={nextPath} />;
}

export default function ParentSetupPage({ searchParams }: PageProps<"/parent/setup">) {
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <header className="grid gap-3">
        <p className="eyebrow">Getting started</p>
        <h1 className="text-balance text-h1">Set up your family.</h1>
        <p className="text-ink-2">
          Pick the currency your family uses. You can add your children next.
        </p>
      </header>
      <Card className="rise-in shadow-raised">
        <CardContent>
          <Suspense fallback={<FormSkeleton />}>
            <SetupForm searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-20 rounded-lg bg-muted" />
      <div className="shimmer h-16 rounded-lg bg-muted" />
      <div className="shimmer h-11 rounded-full bg-muted" />
    </div>
  );
}
