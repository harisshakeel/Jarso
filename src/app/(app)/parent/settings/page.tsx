import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Suspense } from "react";
import { z } from "zod";
import { PageTabs } from "@/components/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { routes } from "@/config";
import {
  ChildrenSettingsList,
  currencyLabels,
  FamilyCodeCard,
  FamilySettingsForm,
  isCurrency,
} from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { DisplayNameForm, ParentDetailsForm } from "@/features/profiles";
import { getParentDetails, getProfile } from "@/features/profiles/server";

export const metadata: Metadata = { title: "Settings" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

const tabValues = ["family", "children", "you"] as const;
const paramsSchema = z.object({ tab: z.enum(tabValues).catch("family") });

type Props = { searchParams: PageProps<"/parent/settings">["searchParams"] };

async function ParentSettings({ searchParams }: Props) {
  const { user, membership } = await requireRole("parent", routes.parentSettings);
  if (!membership) redirect(routes.parentSetup);
  const [family, children, profile, details] = await Promise.all([
    getFamily(),
    listChildren(),
    getProfile(user.id),
    getParentDetails(user.id),
  ]);
  if (!family) redirect(routes.parentSetup);
  const { tab } = paramsSchema.parse(await searchParams);

  const familyTab = (
    <>
      <FamilyCodeCard code={family.code} raised className="rise-in" />
      <Section index={1} title="Family" description="Money is kept in the family's currency.">
        <dl>
          <dt className="text-muted-foreground text-sm">Currency</dt>
          <dd className="font-bold">
            {isCurrency(family.currency) ? currencyLabels[family.currency] : family.currency}
          </dd>
        </dl>
        <FamilySettingsForm timezone={family.timezone} />
      </Section>
    </>
  );

  const childrenTab = (
    <Section
      index={0}
      title="Children"
      description="Rename, reset a PIN, or remove a child from your family."
    >
      <ChildrenSettingsList items={children} />
    </Section>
  );

  const youTab = (
    <>
      <Section index={0} title="Your account" description={user.email ?? undefined}>
        <DisplayNameForm fullName={profile.fullName} />
      </Section>

      {/* Before first completion the layout's dialog collects these; rendering the form here
          too would duplicate its field ids. */}
      {details ? (
        <Section index={1} title="Your details" description="Only you can see these.">
          <ParentDetailsForm
            defaults={details}
            submitLabel="Save details"
            successMessage="Details saved"
          />
        </Section>
      ) : null}
    </>
  );

  return (
    <PageTabs
      label="Settings sections"
      defaultValue={tab}
      tabs={[
        { value: "family", label: "Family", content: familyTab },
        { value: "children", label: "Children", content: childrenTab },
        { value: "you", label: "You", content: youTab },
      ]}
    />
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
      <div className="shimmer h-11 rounded-full bg-muted" />
      <div className="shimmer h-48 rounded-xl bg-muted" />
      <div className="shimmer h-40 rounded-xl bg-muted" />
    </div>
  );
}

export default function ParentSettingsPage({ searchParams }: Props) {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <h1 className="text-h1">Settings</h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <ParentSettings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
