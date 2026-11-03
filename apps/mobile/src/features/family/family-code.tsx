import { familySettingsCopy } from "@jarso/core/family";
import { Share } from "react-native";
import { Card, Eyebrow } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { logger } from "@/lib";

/**
 * The phone shares the code through Android's share sheet (which also offers Copy) instead of
 * the web's Copy button: there is no clipboard module in the app. Phone-only wording, so it
 * lives here rather than in core's web-matched copy.
 */
export const SHARE_CODE = "Share code";

/** The family code a child signs in with (the web's FamilyCodeCard), to read out or share. */
export function FamilyCode({ code }: { code: string }) {
  const share = () =>
    Share.share({ message: code }).catch((error: unknown) => {
      logger.warn("Could not share the family code", { error });
    });
  return (
    <Card>
      <Eyebrow>{familySettingsCopy.codeEyebrow}</Eyebrow>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {familySettingsCopy.codeTitle}
      </Text>
      <Text className="text-muted-foreground">{familySettingsCopy.codeBody}</Text>
      {/* Selectable, so a long press copies it too. */}
      <Text
        selectable
        accessibilityLabel={`${familySettingsCopy.codeEyebrow}: ${code.split("").join(" ")}`}
        className="font-mono text-money-l tracking-[4px]"
      >
        {code}
      </Text>
      <Button variant="secondary" accessibilityLabel={SHARE_CODE} onPress={() => void share()}>
        <Text>{SHARE_CODE}</Text>
      </Button>
    </Card>
  );
}
