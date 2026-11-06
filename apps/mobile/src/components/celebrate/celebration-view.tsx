import { palette, semantic } from "@jarso/brand/tokens";
import type { JarsoLook, JarsoMood } from "@jarso/core/mascot";
import { AwardIcon, FlameIcon, LockOpenIcon, type LucideIcon, ZapIcon } from "lucide-react-native";
import { Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Jarso } from "@/components/brand";
import { Button, Text } from "@/components/ui";
import { useTokens } from "@/lib";
import type { SoundName } from "@/lib/sound";
import { Confetti } from "./confetti";

export type CelebrationTone = "teal" | "gold" | "grape" | "success";
export type CelebrationChip = { icon: "zap" | "flame" | "award" | "unlock"; label: string };

/** One celebration: what `celebrate()` takes. */
export type Celebration = {
  title: string;
  subtitle?: string;
  mood?: JarsoMood;
  tone?: CelebrationTone;
  chips?: CelebrationChip[];
  primary: { label: string; onPress?: () => void };
  secondary?: { label: string; onPress?: () => void };
  sound?: SoundName;
  look?: JarsoLook;
  fill?: number;
  /** A bottom sheet over the screen (lesson feedback) instead of the full screen. */
  sheet?: boolean;
};

type Paint = {
  from: string;
  to: string;
  text: string;
  sub: string;
  primary: "keycap" | "keycap-gold" | "keycap-success";
};

/** The tone's gradient, its text colours and the keycap that stands out on it. */
function usePaint(tone: CelebrationTone): Paint {
  const tokens = useTokens();
  switch (tone) {
    case "gold":
      return {
        from: "#fff3b0",
        to: palette.gold["100"],
        text: semantic.light["gold-foreground"],
        sub: semantic.light["gold-foreground"],
        primary: "keycap",
      };
    case "grape":
      return {
        from: palette.grape["500"],
        to: palette.grape["900"],
        text: semantic.light["ai-foreground"],
        sub: palette.grape["100"],
        primary: "keycap-gold",
      };
    case "success":
      return {
        from: tokens["success-soft"],
        to: tokens.card,
        text: tokens["success-text"],
        sub: tokens.foreground,
        primary: "keycap-success",
      };
    default:
      return {
        from: palette.teal["600"],
        to: palette.teal["900"],
        text: semantic.light["primary-foreground"],
        sub: palette.teal["100"],
        primary: "keycap-gold",
      };
  }
}

const ICONS: Record<CelebrationChip["icon"], { Icon: LucideIcon; colour: string }> = {
  zap: { Icon: ZapIcon, colour: palette.grape["600"] },
  flame: { Icon: FlameIcon, colour: palette.blush },
  award: { Icon: AwardIcon, colour: palette.gold["400"] },
  unlock: { Icon: LockOpenIcon, colour: palette.teal["600"] },
};

function Gradient({ id, paint }: { id: string; paint: Paint }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={paint.from} />
          <Stop offset="1" stopColor={paint.to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function Chips({ chips }: { chips: CelebrationChip[] }) {
  return (
    <View className="flex-row flex-wrap justify-center gap-2">
      {chips.map(({ icon, label }) => {
        const { Icon, colour } = ICONS[icon];
        return (
          <View
            key={`${icon}-${label}`}
            className="h-9 flex-row items-center gap-1.5 rounded-full px-3"
            style={{ backgroundColor: semantic.light.card }}
          >
            <Icon size={18} color={colour} strokeWidth={2.4} />
            <Text className="font-sans-extrabold text-h3" style={{ color: palette["kid-ink"] }}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

type ViewProps = {
  celebration: Celebration;
  onPrimary: () => void;
  onSecondary: () => void;
};

/**
 * The celebration on screen: full screen in the tone's gradient, or a bottom sheet. Android back
 * counts as the primary button.
 */
export function CelebrationView({ celebration, onPrimary, onSecondary }: ViewProps) {
  const { title, subtitle, chips, primary, secondary, sheet } = celebration;
  // The Modal draws under the status bar (statusBarTranslucent), so it pads by the insets itself.
  const insets = useSafeAreaInsets();
  const tone = celebration.tone ?? (sheet ? "success" : "teal");
  const paint = usePaint(tone);
  const center = sheet ? "" : "text-center";

  const jarso = (
    <Jarso
      mood={celebration.mood ?? "cheer"}
      look={celebration.look}
      fill={celebration.fill ?? 0.6}
      size={sheet ? 96 : 170}
    />
  );
  const words = (
    <>
      <Text
        accessibilityRole="header"
        className={`${center} font-sans-extrabold text-display`}
        style={{ color: paint.text }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          className={`${center} font-sans-bold ${sheet ? "text-h3" : "text-h2"}`}
          style={{ color: paint.sub }}
        >
          {subtitle}
        </Text>
      ) : null}
    </>
  );
  const buttons = (
    <View className="w-full gap-2">
      <Button variant={paint.primary} size="lg" onPress={onPrimary}>
        <Text>{primary.label}</Text>
      </Button>
      {secondary ? (
        <Button variant="ghost" size="lg" onPress={onSecondary}>
          <Text style={{ color: paint.text }}>{secondary.label}</Text>
        </Button>
      ) : null}
    </View>
  );

  return (
    <Modal
      testID="celebration-modal"
      visible
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onPrimary}
    >
      {sheet ? (
        <View className="flex-1 justify-end bg-black/30">
          <View
            testID="celebration-sheet"
            className="gap-3 overflow-hidden rounded-t-3xl p-5"
            style={{ paddingBottom: insets.bottom + 32 }}
          >
            <Gradient id={`celebrate-sheet-${tone}`} paint={paint} />
            <Confetti count={16} />
            <View className="flex-row items-center gap-3">
              {jarso}
              <View className="flex-1">{words}</View>
            </View>
            {chips?.length ? <Chips chips={chips} /> : null}
            {buttons}
          </View>
        </View>
      ) : (
        <View
          testID="celebration-full"
          className="flex-1 items-center gap-4 px-6"
          style={{ paddingTop: insets.top + 80, paddingBottom: insets.bottom + 40 }}
        >
          <Gradient id={`celebrate-full-${tone}`} paint={paint} />
          <Confetti />
          <View className="flex-1 items-center justify-center gap-4">
            {jarso}
            {words}
            {chips?.length ? <Chips chips={chips} /> : null}
          </View>
          {buttons}
        </View>
      )}
    </Modal>
  );
}
