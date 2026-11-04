import { parentPageCopy } from "@jarso/core/dashboard";
import {
  currencyLabels,
  familySettingsCopy,
  isCurrency,
  updateFamilySettingsSchema,
} from "@jarso/core/family";
import { profileCopy, updateProfileSchema } from "@jarso/core/profiles";
import { useRouter } from "expo-router";
import { Fragment, type ReactNode, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { z } from "zod";
import { Card, CardSeparator, ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { Field, useSession } from "@/features/auth";
import {
  FamilyCode,
  type FamilyData,
  useFamily,
  useParentProfile,
  useSaveDisplayName,
  useUpdateTimezone,
} from "@/features/family";
import { type ParentGuideState, useParentGuideState } from "@/features/guide";
import { SavedCardsSlot } from "@/features/payments";
import { NotificationsRow } from "@/features/push";
import { ThemeSection } from "@/features/settings";
import { ParentDetailsForm } from "@/features/setup";
import { actionErrorMessage, flash } from "@/lib";
import { ChildSettingsRow } from "./child-settings-row";

/** A settings card: its title, an optional muted line, then its controls. */
function Section({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {title}
        </Text>
        {body ? <Text className="text-muted-foreground">{body}</Text> : null}
      </View>
      {children}
    </Card>
  );
}

/** One text field and its save button, for the name and the timezone. */
function SingleFieldForm({
  label,
  description,
  initial,
  submitLabel,
  schema,
  save,
  pending,
  saved,
}: {
  label: string;
  description?: string;
  initial: string;
  submitLabel: string;
  schema: z.ZodType<string>;
  save: (value: string) => Promise<unknown>;
  pending: boolean;
  saved: string;
}) {
  const [value, setValue] = useState(initial);
  const [fieldError, setFieldError] = useState<string[]>();
  const [formError, setFormError] = useState<string>();

  async function submit() {
    if (pending) return;
    setFormError(undefined);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      setFieldError(z.flattenError(parsed.error).formErrors);
      return;
    }
    setFieldError(undefined);
    try {
      await save(parsed.data);
      flash(saved);
    } catch (error) {
      setFormError(await actionErrorMessage(error));
    }
  }

  return (
    <View className="gap-3">
      <Field
        label={label}
        description={description}
        value={value}
        onChangeText={setValue}
        autoCorrect={false}
        errors={fieldError}
      />
      {formError ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {formError}
        </Text>
      ) : null}
      <Button
        variant="secondary"
        accessibilityLabel={submitLabel}
        accessibilityState={{ busy: pending, disabled: pending }}
        disabled={pending}
        onPress={() => void submit()}
      >
        {pending ? <ActivityIndicator /> : <Text>{submitLabel}</Text>}
      </Button>
    </View>
  );
}

const nameSchema = updateProfileSchema.shape.fullName;
const timezoneSchema = updateFamilySettingsSchema.shape.timezone;

/**
 * The parent's settings (the web's parent settings, minus push; cards are plan 4's slot): the
 * family code, the family's timezone, each child's account and Jarso switch, the parent's name
 * and details, looks, and signing out. One scrolling page; the web's three tabs become sections.
 */
export function ParentSettingsScreen() {
  const { signOut } = useSession();
  const family = useFamily();
  const profile = useParentProfile();
  const guide = useParentGuideState().data;
  const saveName = useSaveDisplayName();

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-4 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title={parentPageCopy.settings} />
      {/* Settings also opens before setup (to sign out), when there is no family yet. */}
      {family.data ? (
        <FamilySections data={family.data} guide={guide} />
      ) : family.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading" />
      ) : null}

      <Section title={profileCopy.accountTitle}>
        {profile.data ? (
          <SingleFieldForm
            label={profileCopy.name}
            initial={profile.data.fullName ?? ""}
            submitLabel={profileCopy.saveName}
            schema={nameSchema}
            save={(name) => saveName.mutateAsync(name)}
            pending={saveName.isPending}
            saved={profileCopy.nameSaved}
          />
        ) : (
          <ActivityIndicator accessibilityLabel="Loading" />
        )}
      </Section>

      {/* Before first completion setup asks for these, so there is nothing to change yet. */}
      {profile.data?.details ? (
        <Section title={profileCopy.detailsTitle} body={profileCopy.detailsBody}>
          <ParentDetailsForm
            defaults={profile.data.details}
            submitLabel={profileCopy.detailsSubmit}
            successMessage={profileCopy.detailsSaved}
          />
        </Section>
      ) : null}

      {/* Saved cards (plan 4): renders nothing until card payments land. */}
      <SavedCardsSlot />

      <NotificationsRow />

      <ThemeSection />

      <Section title={profileCopy.signOutTitle} body={profileCopy.signOutBody}>
        <Button variant="outline" accessibilityLabel="Sign out" onPress={() => void signOut()}>
          <Text>Sign out</Text>
        </Button>
      </Section>
    </ScrollView>
  );
}

/** The family code, the family's timezone and each child's account. */
function FamilySections({
  data,
  guide,
}: {
  data: FamilyData;
  guide: ParentGuideState | undefined;
}) {
  const router = useRouter();
  const saveTimezone = useUpdateTimezone();
  const { family: home, children } = data;
  const currency = isCurrency(home.currency) ? currencyLabels[home.currency] : home.currency;

  return (
    <>
      <FamilyCode code={home.code} />

      <Section
        title={familySettingsCopy.familyTitle}
        body={familySettingsCopy.familyBody(currency)}
      >
        <SingleFieldForm
          key={home.timezone}
          label={familySettingsCopy.timezone}
          description={familySettingsCopy.timezoneHelp}
          initial={home.timezone}
          submitLabel={familySettingsCopy.save}
          schema={timezoneSchema}
          save={(timezone) => saveTimezone.mutateAsync(timezone)}
          pending={saveTimezone.isPending}
          saved={familySettingsCopy.saved}
        />
        <Button
          variant="ghost"
          accessibilityLabel={familySettingsCopy.acceptChildInvitation}
          onPress={() => router.push("/(parent)/invite")}
        >
          <Text className="text-primary">{familySettingsCopy.acceptChildInvitation}</Text>
        </Button>
      </Section>

      <Section title={familySettingsCopy.childrenTitle} body={familySettingsCopy.childrenBody}>
        {children.length === 0 ? (
          <Text className="text-muted-foreground">{familySettingsCopy.noChildren}</Text>
        ) : (
          children.map((child, index) => (
            <Fragment key={child.id}>
              {index > 0 ? <CardSeparator /> : null}
              <ChildSettingsRow
                child={child}
                guide={
                  guide?.configured ? { enabled: guide.enabledChildIds.includes(child.id) } : null
                }
              />
            </Fragment>
          ))
        )}
        <Button
          variant="secondary"
          accessibilityLabel={familySettingsCopy.addChild}
          onPress={() => router.push("/(parent)/children/new")}
        >
          <Text>{familySettingsCopy.addChild}</Text>
        </Button>
      </Section>
    </>
  );
}
