import { familySettingsCopy } from "@jarso/core/family";
import { useRouter } from "expo-router";
import { Card } from "@/components/screen";
import { Button, Text } from "@/components/ui";

/** A family with no children yet (the web's FirstChildCard): one sentence and the next steps. */
export function FirstChildCard() {
  const router = useRouter();
  return (
    <Card className="items-center gap-4 py-6">
      <Text className="text-center font-sans-bold text-h3">{familySettingsCopy.firstChild}</Text>
      <Button
        className="self-stretch"
        accessibilityLabel={familySettingsCopy.addChild}
        onPress={() => router.push("/(parent)/children/new")}
      >
        <Text>{familySettingsCopy.addChild}</Text>
      </Button>
      <Button
        className="self-stretch"
        variant="outline"
        accessibilityLabel={familySettingsCopy.acceptInvitation}
        onPress={() => router.push("/(parent)/invite")}
      >
        <Text>{familySettingsCopy.acceptInvitation}</Text>
      </Button>
    </Card>
  );
}
