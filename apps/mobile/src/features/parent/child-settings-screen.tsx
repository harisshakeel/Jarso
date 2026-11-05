import { familySettingsCopy } from "@jarso/core/family";
import { parentGuideCopy } from "@jarso/core/guide";
import { Redirect, Stack, useRouter } from "expo-router";
import { HashIcon, PencilIcon } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  InitialAvatar,
  KeyboardScrollView,
  ListGroup,
  ListRow,
  RowIcon,
} from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useFamily } from "@/features/family";
import { GuideSwitch, useParentGuideState } from "@/features/guide";
import { PinForm, RemoveDialog, RenameForm } from "./child-settings-forms";
import { ScreenState } from "./screen-state";

type Mode = "rename" | "pin" | null;

/**
 * One child's settings, opened from Settings (mockup screen 3): who they are and how they sign in,
 * Rename and Reset PIN (each opens in place under its row), Jarso's switch while Jarso is set up,
 * and Remove on its own at the bottom of the screen, behind today's confirm. After a removal the
 * page goes back to Settings; an id that isn't one of the parent's children goes there at once.
 */
export function ChildSettingsScreen({ childId }: { childId: string }) {
  const router = useRouter();
  const family = useFamily();
  const guide = useParentGuideState().data;
  const [mode, setMode] = useState<Mode>(null);
  const [removing, setRemoving] = useState(false);
  // Set once the child is removed, so the family's refetch without them doesn't redirect too.
  const [removed, setRemoved] = useState(false);

  if (removed) return null;
  if (!family.data) {
    return <ScreenState error={family.error} onRetry={() => void family.refetch()} />;
  }
  const child = family.data.children.find((one) => one.id === childId);
  if (!child) return <Redirect href="/(parent)/settings" />;

  const toggle = (next: Mode) => setMode((current) => (current === next ? null : next));
  const leave = () => {
    setRemoved(true);
    if (router.canGoBack()) router.back();
    else router.replace("/(parent)/settings");
  };

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
      <Stack.Screen options={{ title: child.nickname }} />
      <KeyboardScrollView contentContainerClassName="grow gap-4 px-4 pt-4 pb-4">
        <Card className="flex-row items-center gap-3">
          <InitialAvatar name={child.nickname} large />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-sans-bold text-h3">{child.nickname}</Text>
            <Text className="text-small text-muted-foreground">
              {familySettingsCopy.childSignsIn(family.data.family.code)}
            </Text>
          </View>
        </Card>

        <ListGroup label={familySettingsCopy.signInGroup}>
          <ListRow
            label={familySettingsCopy.rename}
            detail={familySettingsCopy.nicknameIs(child.nickname)}
            leading={<RowIcon icon={PencilIcon} />}
            expanded={mode === "rename"}
            onPress={() => toggle("rename")}
          />
          {mode === "rename" ? (
            <View className="py-3">
              <RenameForm child={child} onDone={() => setMode(null)} />
            </View>
          ) : null}
          <ListRow
            label={familySettingsCopy.resetPin}
            detail={familySettingsCopy.pinRowBody}
            leading={<RowIcon icon={HashIcon} />}
            expanded={mode === "pin"}
            onPress={() => toggle("pin")}
          />
          {mode === "pin" ? (
            <View className="py-3">
              <PinForm child={child} onDone={() => setMode(null)} />
            </View>
          ) : null}
        </ListGroup>

        {guide?.configured ? (
          <ListGroup label={parentGuideCopy.settingsGroup}>
            <GuideSwitch
              childId={child.id}
              nickname={child.nickname}
              enabled={guide.enabledChildIds.includes(child.id)}
              detail="none"
            />
          </ListGroup>
        ) : null}

        {/* Apart from everything else, at the bottom of the screen (below the forms when open). */}
        <View className="mt-auto pt-6">
          <Button
            variant="outline"
            className="border-destructive"
            accessibilityLabel={familySettingsCopy.removeFromFamily(child.nickname)}
            onPress={() => setRemoving(true)}
          >
            <Text className="text-destructive">
              {familySettingsCopy.removeFromFamily(child.nickname)}
            </Text>
          </Button>
        </View>
      </KeyboardScrollView>
      {removing ? (
        <RemoveDialog child={child} onClose={() => setRemoving(false)} onRemoved={leave} />
      ) : null}
    </SafeAreaView>
  );
}
