import { View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

type JarCardProps = {
  jar: "spend" | "save";
  name: string;
  amount: string;
  caption: string;
  /** How full the jar looks, 0 to 1, on the scale shared by both jars. */
  share: number;
  /** Lines under the jar: what is waiting or held, in the web's words. */
  notes?: string[];
};

/** One jar drawn with views (no jar art ships as a bitmap), its name, balance and caption. */
export function JarCard({ jar, name, amount, caption, share, notes = [] }: JarCardProps) {
  const fill = Math.round(Math.min(Math.max(share, 0), 1) * 100);
  return (
    <View
      accessible
      accessibilityLabel={`${name} jar`}
      accessibilityRole="summary"
      className="flex-1 items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-4"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="items-center"
      >
        <View className="h-2.5 w-16 rounded-md bg-primary" />
        <View className="h-24 w-24 justify-end overflow-hidden rounded-b-3xl rounded-t-lg border-4 border-primary bg-background">
          <View
            testID={`${jar}-fill`}
            style={{ height: `${fill}%` }}
            className={cn("w-full", jar === "spend" ? "bg-cyan-400" : "bg-gold")}
          />
        </View>
      </View>
      <Text
        className={cn(
          "font-sans-bold text-h3",
          jar === "spend" ? "text-primary" : "text-gold-text",
        )}
      >
        {name}
      </Text>
      <Text className="font-sans-extrabold text-money-l">{amount}</Text>
      <Text className="text-center text-muted-foreground text-sm">{caption}</Text>
      {notes.map((note) => (
        <Text key={note} className="text-center text-muted-foreground text-sm">
          {note}
        </Text>
      ))}
    </View>
  );
}
