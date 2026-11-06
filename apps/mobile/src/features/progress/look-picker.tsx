import {
  type JarsoLook,
  LID_COLORS,
  lookCopy,
  WEAR_UNLOCK_LEVEL,
  type Wear,
  wearUnlocked,
} from "@jarso/core/mascot";
import { CheckIcon, LockIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Jarso, lidHex } from "@/components/brand";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

type LookPickerProps = { level: number; value: JarsoLook; onChange: (look: JarsoLook) => void };

const WEARS = Object.keys(WEAR_UNLOCK_LEVEL) as Wear[];

/**
 * Make Jarso yours: a live preview, lid colour swatches and the wear options. Wear above the
 * child's level is shown with the level that unlocks it and can't be picked (never bought).
 */
export function LookPicker({ level, value, onChange }: LookPickerProps) {
  const tokens = useTokens();
  return (
    <View className="gap-5">
      <View className="items-center">
        <Jarso
          mood="cheer"
          size={140}
          fill={0.5}
          look={value}
          bounce
          accessibilityLabel={lookCopy.preview}
        />
      </View>

      <View className="gap-2">
        <Text className="font-sans-bold text-small text-muted-foreground">
          {lookCopy.lidHeading}
        </Text>
        <View
          role="radiogroup"
          accessibilityRole="radiogroup"
          accessibilityLabel={lookCopy.lidHeading}
          className="flex-row flex-wrap gap-3"
        >
          {LID_COLORS.map((lid) => {
            const checked = value.lid === lid;
            return (
              <Pressable
                key={lid}
                accessibilityRole="radio"
                accessibilityLabel={lookCopy.lidLabel(lookCopy.lid[lid])}
                accessibilityState={{ checked }}
                onPress={() => onChange({ ...value, lid })}
                className={cn(
                  "size-12 items-center justify-center rounded-full border-4",
                  checked ? "border-primary" : "border-transparent",
                )}
              >
                <View
                  className="size-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: lidHex(lid) }}
                >
                  {checked ? <CheckIcon size={18} color="#ffffff" strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2">
        <Text className="font-sans-bold text-small text-muted-foreground">
          {lookCopy.wearHeading}
        </Text>
        <View
          role="radiogroup"
          accessibilityRole="radiogroup"
          accessibilityLabel={lookCopy.wearHeading}
          className="flex-row flex-wrap gap-2"
        >
          {WEARS.map((wear) => {
            const unlocked = wearUnlocked(wear, level);
            const checked = value.wear === wear;
            const name = lookCopy.wear[wear];
            const unlockAt = WEAR_UNLOCK_LEVEL[wear];
            return (
              <Pressable
                key={wear}
                accessibilityRole="radio"
                accessibilityLabel={unlocked ? name : lookCopy.lockedLabel(name, unlockAt)}
                accessibilityState={{ checked, disabled: !unlocked }}
                disabled={!unlocked}
                onPress={() => onChange({ ...value, wear })}
                className={cn(
                  "min-h-11 flex-row items-center gap-1.5 rounded-full border-2 px-4",
                  checked ? "border-primary bg-primary/10" : "border-border bg-card",
                  !unlocked && "opacity-60",
                )}
              >
                {unlocked ? null : <LockIcon size={14} color={tokens["muted-foreground"]} />}
                <Text className="font-sans-bold text-small">{name}</Text>
                {unlocked ? null : (
                  <Text className="text-caption text-muted-foreground">
                    {lookCopy.unlocksAt(unlockAt)}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
