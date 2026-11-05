import { familySettingsCopy } from "@jarso/core/family";
import { parentGuideCopy } from "@jarso/core/guide";
import { noticeGroupCopy } from "@jarso/core/notifications";
import { profileCopy } from "@jarso/core/profiles";
import { useRouter } from "expo-router";
import { BellIcon, ClockIcon, MailIcon, MoonIcon, PlusIcon, UserIcon } from "lucide-react-native";
import { ActivityIndicator, ScrollView } from "react-native";
import { InitialAvatar, ListGroup, ListRow, RowIcon } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { FamilyCode, type FamilyData, useFamily, useParentProfile } from "@/features/family";
import { type ParentGuideState, useParentGuideState } from "@/features/guide";
import { SavedCardsSlot } from "@/features/payments";
import { DarkModeRow } from "@/features/settings";

/**
 * The parent's settings as a short menu that fits one screen (spec 2026-11-05): the family code,
 * the children, the family, the parent, and signing out. Each form opens on its own page. Before
 * setup there is no family yet, so only the You group and Sign out show (the parent can leave).
 */
export function ParentSettingsScreen() {
  const { signOut } = useSession();
  const router = useRouter();
  const family = useFamily();
  const profile = useParentProfile();
  const guide = useParentGuideState().data;

  return (
    <ScrollView className="bg-background" contentContainerClassName="gap-4 px-4 pt-4 pb-10">
      {family.data ? (
        <FamilyGroups data={family.data} guide={guide} />
      ) : family.isPending ? (
        <ActivityIndicator accessibilityLabel="Loading" />
      ) : null}

      <ListGroup label={profileCopy.youGroup}>
        <ListRow
          label={profileCopy.accountTitle}
          detail={profile.data?.fullName ?? undefined}
          leading={<RowIcon icon={UserIcon} />}
          onPress={() => router.push("/(parent)/settings/account")}
        />
        {/* No subtitle: push has several states, and summing them up is new work (spec). */}
        <ListRow
          label={noticeGroupCopy.title}
          leading={<RowIcon icon={BellIcon} />}
          onPress={() => router.push("/(parent)/notifications")}
        />
        <DarkModeRow leading={<RowIcon icon={MoonIcon} />} />
      </ListGroup>

      {/* Saved cards: renders nothing until card payments are on. */}
      <SavedCardsSlot />

      <Button variant="outline" accessibilityLabel="Sign out" onPress={() => void signOut()}>
        <Text>Sign out</Text>
      </Button>
    </ScrollView>
  );
}

/** The family code, a row per child (and Add a child), then the family's own settings. */
function FamilyGroups({ data, guide }: { data: FamilyData; guide: ParentGuideState | undefined }) {
  const router = useRouter();
  const { family: home, children } = data;

  return (
    <>
      <FamilyCode code={home.code} />

      <ListGroup label={familySettingsCopy.childrenTitle}>
        {children.map((child) => (
          <ListRow
            key={child.id}
            label={child.nickname}
            detail={
              guide?.configured
                ? parentGuideCopy.childState(guide.enabledChildIds.includes(child.id))
                : undefined
            }
            leading={<InitialAvatar name={child.nickname} />}
            onPress={() =>
              router.push({
                pathname: "/(parent)/settings/children/[childId]",
                params: { childId: child.id },
              })
            }
          />
        ))}
        <ListRow
          label={familySettingsCopy.addChild}
          labelClassName="text-primary"
          leading={<RowIcon icon={PlusIcon} />}
          onPress={() => router.push("/(parent)/children/new")}
        />
      </ListGroup>

      <ListGroup label={familySettingsCopy.familyTitle}>
        <ListRow
          label={familySettingsCopy.timezone}
          detail={home.timezone}
          leading={<RowIcon icon={ClockIcon} />}
          onPress={() => router.push("/(parent)/settings/timezone")}
        />
        <ListRow
          label={familySettingsCopy.acceptChildInvitation}
          leading={<RowIcon icon={MailIcon} />}
          onPress={() => router.push("/(parent)/invite")}
        />
      </ListGroup>
    </>
  );
}
