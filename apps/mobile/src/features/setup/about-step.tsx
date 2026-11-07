import { profileCopy } from "@jarso/core/profiles";
import { childFacingNameSchema } from "@jarso/core/progress";
import { CHILD_CALLS_YOU, setupFlowCopy } from "@jarso/core/setup";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { Label, Text } from "@/components/ui";
import { ChoiceChip } from "@/features/allowance";
import { Field } from "@/features/auth";
import { isAppError, logger } from "@/lib";
import { ParentDetailsForm } from "./profile-step";
import { SetupFrame, StepHeading } from "./setup-frame";
import { useSaveChildFacingName } from "./use-setup";

const copy = setupFlowCopy.about;
const OTHER = "other";

/**
 * Step 3c, the first screen with a session: what the children call the parent (optional; child
 * screens say "your parent" without it) and the details ADR 0008 asks for. The name is written
 * just before the details; if that write fails it is logged and setup goes on.
 */
export function AboutStep({ children }: { children?: ReactNode }) {
  const saveName = useSaveChildFacingName();
  const [picked, setPicked] = useState<string | null>(null);
  const [other, setOther] = useState("");

  const name = picked === OTHER ? other : picked;
  const parsed = childFacingNameSchema.safeParse(name);

  async function saveCallsYou() {
    if (!parsed.success || !parsed.data) return;
    try {
      await saveName.mutateAsync(parsed.data);
    } catch (error) {
      logger.warn("Could not save what the children call the parent", {
        code: isAppError(error) ? error.code : undefined,
      });
    }
  }

  return (
    <SetupFrame step="account">
      <StepHeading title={copy.title} />
      <View className="gap-2">
        <Label nativeID="calls-you-label">{copy.callsYou}</Label>
        <View
          accessibilityRole="radiogroup"
          aria-labelledby="calls-you-label"
          className="flex-row flex-wrap gap-2"
        >
          {[...CHILD_CALLS_YOU, OTHER].map((value) => (
            <ChoiceChip
              key={value}
              label={value === OTHER ? copy.other : value}
              checked={picked === value}
              onPress={() => setPicked(picked === value ? null : value)}
            />
          ))}
        </View>
        <Text className="text-muted-foreground">{copy.callsYouHelp}</Text>
        {picked === OTHER ? (
          <Field
            label={copy.otherLabel}
            value={other}
            onChangeText={setOther}
            autoCorrect={false}
            maxLength={20}
          />
        ) : null}
      </View>
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {profileCopy.detailsTitle}
        </Text>
        <Text className="text-ink-2">{profileCopy.detailsBody}</Text>
      </View>
      <ParentDetailsForm beforeSave={saveCallsYou} />
      {children}
    </SetupFrame>
  );
}
