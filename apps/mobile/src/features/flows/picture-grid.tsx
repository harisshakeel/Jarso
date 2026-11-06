import type { PictureOption } from "@jarso/core/home";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";
import { pictureIcon, TINT } from "./icons";

type PictureGridProps = {
  options: (PictureOption & { emoji?: string })[];
  value: string | null;
  onChange: (key: string) => void;
  /** What the group is called to a screen reader ("On what?"). */
  legend: string;
};

/** A grid of picture tiles; one is chosen. Each tile is a radio with its label. */
export function PictureGrid({ options, value, onChange, legend }: PictureGridProps) {
  const tokens = useTokens();
  return (
    <View
      role="radiogroup"
      accessibilityRole="radiogroup"
      accessibilityLabel={legend}
      className="flex-row flex-wrap gap-2"
    >
      {options.map((option) => {
        const checked = option.key === value;
        const Icon = pictureIcon(option.icon);
        const tint = TINT[option.tint];
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked }}
            onPress={() => onChange(option.key)}
            className={cn(
              "min-h-24 w-[31.5%] grow items-center justify-center gap-2 rounded-xl border-2 bg-card p-2",
              checked ? "border-primary" : "border-border",
            )}
          >
            <View className={cn("size-12 items-center justify-center rounded-xl", tint.box)}>
              {option.emoji ? (
                <Text className="text-h1">{option.emoji}</Text>
              ) : (
                <Icon size={26} color={tokens[tint.icon]} />
              )}
            </View>
            <Text numberOfLines={1} className="font-sans-bold text-small">
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
