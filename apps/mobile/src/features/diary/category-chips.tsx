import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/utils";

type ChipOption = { key: string; emoji: string; label: string };

type CategoryChipsProps = {
  options: readonly ChipOption[];
  /** The chosen key, or null before anything is picked. */
  value: string | null;
  onChange: (key: string) => void;
  legend: string;
};

/** "What was it for?" as a 3-column grid of radio chips, like the web. The emoji is decoration. */
export function CategoryChips({ options, value, onChange, legend }: CategoryChipsProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={legend} className="gap-2">
      <Text className="font-sans-bold">{legend}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const checked = value === option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked }}
              onPress={() => onChange(option.key)}
              className={cn(
                "min-h-11 basis-[31%] grow items-center justify-center gap-0.5 rounded-lg border border-border px-1 py-2",
                checked && "border-transparent bg-secondary",
              )}
            >
              <Text accessibilityElementsHidden importantForAccessibility="no" className="text-h2">
                {option.emoji}
              </Text>
              <Text className={cn("font-sans-bold", checked && "text-secondary-foreground")}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
