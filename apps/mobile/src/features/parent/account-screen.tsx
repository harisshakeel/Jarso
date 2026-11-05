import { profileCopy, updateProfileSchema } from "@jarso/core/profiles";
import { View } from "react-native";
import { Card, KeyboardScrollView } from "@/components/screen";
import { Text } from "@/components/ui";
import { useParentProfile, useSaveDisplayName } from "@/features/family";
import { ParentDetailsForm } from "@/features/setup";
import { ScreenState } from "./screen-state";
import { SingleFieldForm } from "./single-field-form";

const nameSchema = updateProfileSchema.shape.fullName;

/**
 * The parent's name and details (mockup screen 5). Opens before setup too: until setup has asked
 * for the details there is only the name.
 */
export function AccountSettingsScreen() {
  const profile = useParentProfile();
  const saveName = useSaveDisplayName();

  if (!profile.data) {
    return <ScreenState error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  const { fullName, details } = profile.data;

  return (
    <KeyboardScrollView className="bg-background" contentContainerClassName="gap-4 px-4 pt-4 pb-10">
      <Card>
        <SingleFieldForm
          label={profileCopy.name}
          initial={fullName ?? ""}
          submitLabel={profileCopy.saveName}
          schema={nameSchema}
          save={(name) => saveName.mutateAsync(name)}
          pending={saveName.isPending}
          saved={profileCopy.nameSaved}
        />
      </Card>

      {details ? (
        <Card>
          <View className="gap-1">
            <Text accessibilityRole="header" className="font-sans-bold text-h3">
              {profileCopy.detailsTitle}
            </Text>
            <Text className="text-muted-foreground">{profileCopy.detailsBody}</Text>
          </View>
          <ParentDetailsForm
            defaults={details}
            submitLabel={profileCopy.detailsSubmit}
            successMessage={profileCopy.detailsSaved}
          />
        </Card>
      ) : null}
    </KeyboardScrollView>
  );
}
