import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { AddChildForm } from "@/features/family";
import { requireRole } from "@/features/family/server";
import { JarsoNotice } from "@/features/guide";
import { isGuideConfigured } from "@/features/guide/server";

export const metadata: Metadata = { title: "Add a child" };

async function GuardedAddChildForm() {
  const { membership } = await requireRole("parent", routes.parentNewChild);
  if (!membership) redirect(routes.parentSetup);
  return (
    <div className="grid gap-6">
      {/* Jarso is on by default (ADR 0011): the parent is told before the child exists. */}
      {isGuideConfigured() ? <JarsoNotice /> : null}
      <AddChildForm />
    </div>
  );
}

export default function AddChildPage() {
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <header className="grid gap-3">
        <p className="eyebrow">Your family</p>
        <h1 className="text-balance text-h1">Add a child.</h1>
        <p className="text-ink-2">
          Choose a nickname and a PIN. Your child signs in with these and your family code, which is
          in Settings.
        </p>
      </header>
      <Card className="rise-in shadow-raised">
        <CardContent>
          <Suspense fallback={<FormSkeleton />}>
            <GuardedAddChildForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-24 rounded-lg bg-muted" />
      <div className="shimmer h-24 rounded-lg bg-muted" />
      <div className="shimmer h-6 rounded-lg bg-muted" />
      <div className="shimmer h-11 rounded-full bg-muted" />
    </div>
  );
}
