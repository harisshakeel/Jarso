import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { Suspense } from "react";
import { z } from "zod";
import { PageTabs, SlowFallback } from "@/components/shell";
import { SoundsToggle } from "@/components/sounds";
import { ThemeChoice } from "@/components/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { routes } from "@/config";
import { SignOutButton } from "@/features/auth";
import { parentPageCopy } from "@/features/dashboard";
import {
  ChildrenSettingsList,
  currencyLabels,
  FamilyCodeCard,
  FamilySettingsForm,
  familySettingsCopy,
  isCurrency,
} from "@/features/family";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import { PushToggle } from "@/features/notifications";
import { paymentCopy, SavedCards } from "@/features/payments";
import { getSavedCards, paymentsEnabled } from "@/features/payments/server";
import { DisplayNameForm, ParentDetailsForm, profileCopy } from "@/features/profiles";
import { getParentDetails, getProfile } from "@/features/profiles/server";

export const metadata: Metadata = { title: "Settings" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

const tabValues = ["family", "children", "you"] as const;
const paramsSchema = z.object({ tab: z.enum(tabValues).catch("family") });

type Props = { searchParams: PageProps<"/parent/settings">["searchParams"] };

async function ParentSettings({ searchParams }: Props) {
  const { user, membership } = await requireRole("parent", routes.parentSettings);
  if (!membership) redirect(routes.parentSetup);
  const cardPayments = paymentsEnabled();
  const [family, children, profile, details, savedCards] = await Promise.all([
    getFamily(),
    listChildren(),
    getProfile(user.id),
    getParentDetails(user.id),
    cardPayments ? getSavedCards() : [],
  ]);
  if (!family) redirect(routes.parentSetup);
  const { tab } = paramsSchema.parse(await searchParams);

  const familyTab = (
    <>
      <FamilyCodeCard code={family.code} raised className="rise-in" />
      <Section
        index={1}
        title={familySettingsCopy.familyTitle}
        description={familySettingsCopy.familyBody(
          isCurrency(family.currency) ? currencyLabels[family.currency] : family.currency,
        )}
      >
        <FamilySettingsForm timezone={family.timezone} />
        <p>
          <Link
            href={routes.invite}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
          >
            {familySettingsCopy.acceptChildInvitation}
          </Link>
        </p>
      </Section>
    </>
  );

  const childrenTab = (
    <Section
      index={0}
      title={familySettingsCopy.childrenTitle}
      description={familySettingsCopy.childrenBody}
    >
      <ChildrenSettingsList items={children} />
    </Section>
  );

  const youTab = (
    <>
      <Section index={0} title={profileCopy.accountTitle} description={user.email ?? undefined}>
        <DisplayNameForm fullName={profile.fullName} />
      </Section>

      {/* Before first completion the layout's dialog collects these; rendering the form here
          too would duplicate its field ids. */}
      {details ? (
        <Section index={1} title={profileCopy.detailsTitle} description={profileCopy.detailsBody}>
          <ParentDetailsForm
            defaults={details}
            submitLabel={profileCopy.detailsSubmit}
            successMessage={profileCopy.detailsSaved}
          />
        </Section>
      ) : null}

      {savedCards.length > 0 ? (
        <Section
          index={2}
          title={paymentCopy.savedCardTitle(savedCards)}
          description={paymentCopy.testMode}
        >
          <SavedCards cards={savedCards} />
        </Section>
      ) : null}
      <Section index={3} title={profileCopy.looksTitle} description={profileCopy.looksBody}>
        <ThemeChoice />
      </Section>
      <SoundsToggle />
      <PushToggle />
      <Section index={4} title={profileCopy.signOutTitle} description={profileCopy.signOutBody}>
        <SignOutButton />
      </Section>
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
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <h1 className="text-h1">{parentPageCopy.settings}</h1>
      <Suspense
        fallback={
          <SlowFallback>
            <SettingsSkeleton />
          </SlowFallback>
        }
      >
        <ParentSettings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
