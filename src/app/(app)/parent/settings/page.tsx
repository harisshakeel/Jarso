import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { routes } from "@/config";
import { SignOutButton } from "@/features/auth";
import {
  ChildrenSettingsList,
  currencyLabels,
  FamilySettingsForm,
  isCurrency,
} from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { DisplayNameForm } from "@/features/profiles";
import { getProfile } from "@/features/profiles/server";

export const metadata: Metadata = { title: "Settings" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

async function ParentSettings() {
  const { user, membership } = await requireRole("parent", routes.parentSettings);
  if (!membership) redirect(routes.parentSetup);
  const [family, children, profile] = await Promise.all([
    getFamily(),
    listChildren(),
    getProfile(user.id),
  ]);
  if (!family) redirect(routes.parentSetup);

  return (
    <>
      <Section
        index={0}
        title="Family"
        description="The family code is how your children sign in. Money is kept in the family's currency."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-sm">Family code</dt>
            <dd className="font-extrabold text-h3 tabular-nums tracking-[0.2em]">{family.code}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">Currency</dt>
            <dd className="font-bold">
              {isCurrency(family.currency) ? currencyLabels[family.currency] : family.currency}
            </dd>
          </div>
        </dl>
        <FamilySettingsForm timezone={family.timezone} />
      </Section>

      <Section
        index={1}
        title="Children"
        description="Rename, reset a PIN, or remove a child from your family."
      >
        <ChildrenSettingsList items={children} />
      </Section>

      <Section index={2} title="Your account" description={user.email ?? undefined}>
        <DisplayNameForm fullName={profile.fullName} />
        <SignOutButton />
      </Section>
    </>
  );
}

function Section({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="rise-in" style={rise(index)}>
      <CardHeader>
        <CardTitle className="text-h2">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-6">{children}</CardContent>
    </Card>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-48 rounded-xl bg-muted" />
      <div className="shimmer h-40 rounded-xl bg-muted" />
      <div className="shimmer h-40 rounded-xl bg-muted" />
    </div>
  );
}

export default function ParentSettingsPage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <h1 className="text-h1">Settings</h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <ParentSettings />
      </Suspense>
    </div>
  );
}
