import { familySettingsCopy } from "@jarso/core/family";
import { Share, View } from "react-native";
import { Card, Eyebrow } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { logger } from "@/lib";

/**
 * The phone shares the code through Android's share sheet (which also offers Copy) instead of
 * the web's Copy button: there is no clipboard module in the app. Phone-only wording, so it
 * lives here rather than in core's web-matched copy. The button reads "Share"; screen readers
 * hear "Share code".
 */
export const SHARE_CODE = "Share code";
export const SHARE = "Share";

/**
 * The family code a child signs in with (the web's FamilyCodeCard), compact for the Settings
 * menu: label, code, a short line, and Share on the right.
 */
export function FamilyCode({ code }: { code: string }) {
  const share = () =>
    Share.share({ message: code }).catch((error: unknown) => {
      logger.warn("Could not share the family code", { error });
    });
  return (
    <Card className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Eyebrow>{familySettingsCopy.codeEyebrow}</Eyebrow>
        {/* Selectable, so a long press copies it too. */}
        <Text
          selectable
          accessibilityLabel={`${familySettingsCopy.codeEyebrow}: ${code.split("").join(" ")}`}
          className="font-mono text-money-l tracking-[4px]"
        >
          {code}
        </Text>
        <Text className="text-small text-muted-foreground">{familySettingsCopy.codeShort}</Text>
      </View>
      <Button variant="secondary" accessibilityLabel={SHARE_CODE} onPress={() => void share()}>
        <Text>{SHARE}</Text>
      </Button>
    </Card>
  );
}
