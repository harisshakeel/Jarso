import { inputCopy, type OptionArt, optionArts } from "@jarso/core/learning";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

type PictureOptionsProps = {
  /** Text already rendered with renderText. */
  options: { id: string; text: string }[];
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
};

/** A picture for the option: category emoji, or its letter in a tinted circle. */
function Art({ art }: { art: OptionArt }) {
  if (art.kind === "emoji") {
    return (
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        className="text-center"
        style={{ fontSize: 40, lineHeight: 48 }}
      >
        {art.emoji}
      </Text>
    );
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="size-12 items-center justify-center rounded-full bg-tint-grape"
    >
      <Text className="font-sans-extrabold text-h2 text-grape-700">{art.letter}</Text>
    </View>
  );
}

/** Answer choices as big picture tiles, two to a row: the child's twin of the web's radio cards. */
export function PictureOptions({ options, selected, disabled, onSelect }: PictureOptionsProps) {
  const arts = optionArts(options.map((option) => option.text));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={inputCopy.pickOne}
      className="flex-row flex-wrap gap-3"
    >
      {options.map((option, i) => {
        const checked = selected === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={option.text}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={() => onSelect(option.id)}
            className={cn(
              "min-h-32 items-center justify-center gap-2 rounded-[24px] border-2 bg-card p-3",
              "w-[48%] grow",
              checked ? "border-primary bg-tint-teal" : "border-border",
            )}
          >
            <Art art={arts[i] ?? { kind: "letter", letter: "A" }} />
            <Text className="text-center font-sans-bold">{option.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
