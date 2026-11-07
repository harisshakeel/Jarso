import { childSignInLink } from "@jarso/core/family";
import { setupFlowCopy } from "@jarso/core/setup";
import { ActivityIndicator, Share, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Notice } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { useFamily } from "@/features/family";
import { logger, toUserMessage } from "@/lib";
import { QrCode } from "./qr-code";
import { SetupFrame, StepHeading } from "./setup-frame";

const copy = setupFlowCopy.share;

function Line({ label, value, spoken }: { label: string; value: string; spoken?: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-2">
      <Text className="text-ink-2">{label}</Text>
      <Text
        selectable
        accessibilityLabel={`${label}: ${spoken ?? value}`}
        className="shrink font-sans-extrabold text-h3"
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Step 7: how the child signs in. The family code and nickname, printed and as a QR the child's
 * phone scans (`jarso://sign-in?code=…&nickname=…`, core `childSignInLink`). Never the PIN: it
 * was typed once in step 4 and is not kept anywhere on this phone.
 */
export function ShareStep({ nickname, onDone }: { nickname: string; onDone: () => void }) {
  const family = useFamily();
  const familyCode = family.data?.family.code;
  const link = familyCode ? childSignInLink({ familyCode, nickname }) : null;

  const share = () => {
    if (!familyCode || !link) return;
    Share.share({ message: copy.message({ familyCode, nickname, link }) }).catch(
      (error: unknown) => {
        logger.warn("Could not share the sign-in details", {
          name: error instanceof Error ? error.name : undefined,
        });
      },
    );
  };

  return (
    <SetupFrame
      step="share"
      footer={
        <>
          <Button
            variant="keycap-gold"
            size="lg"
            disabled={!link}
            accessibilityLabel={copy.send}
            onPress={share}
          >
            <Text>{copy.send}</Text>
          </Button>
          <Button variant="keycap-white" size="lg" accessibilityLabel={copy.done} onPress={onDone}>
            <Text>{copy.done}</Text>
          </Button>
        </>
      }
    >
      <View className="items-center">
        <Jarso mood="cheer" size={120} bounce />
      </View>
      <StepHeading title={copy.title(nickname)} />
      {familyCode && link ? (
        <View className="gap-4 rounded-3xl bg-card p-5">
          <Text className="font-sans-extrabold text-caption tracking-widest text-ink-2">
            {copy.signsInWith(nickname).toUpperCase()}
          </Text>
          <View>
            <Line
              label={copy.familyCode}
              value={familyCode}
              spoken={familyCode.split("").join(" ")}
            />
            <Line label={copy.nickname} value={nickname} />
            <Line label={copy.pin} value={copy.pinValue} />
          </View>
          <View className="items-center gap-2 rounded-2xl bg-white p-3">
            <QrCode value={link} label={copy.qrLabel(nickname)} />
          </View>
          <Text className="text-center text-ink-2">{copy.scan(nickname)}</Text>
        </View>
      ) : family.error ? (
        <Notice message={toUserMessage(family.error)} />
      ) : (
        <View className="items-center py-8">
          <ActivityIndicator accessibilityLabel="Loading" />
        </View>
      )}
    </SetupFrame>
  );
}
