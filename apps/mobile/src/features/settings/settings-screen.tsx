import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { cn } from "@/lib/utils";
import { type ThemeChoice, useThemeChoice } from "./theme";
import { useNickname } from "./use-nickname";

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Same as my phone" },
];

/** The child's Me tab: who they are, how it looks, and signing out. */
export function SettingsScreen() {
  const { signOut } = useSession();
  const [theme, setTheme] = useThemeChoice();
  const { data: nickname } = useNickname();
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-6 p-4">
        <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
          Me
        </Text>
        <View className="gap-1 rounded-xl bg-card p-4">
          <Text accessibilityRole="header" className="font-sans-extrabold text-h3">
            You
          </Text>
          <Text className="text-muted-foreground">
            {nickname ? `You sign in as ${nickname}.` : "Your nickname is how you sign in."} A
            parent can change your nickname or PIN.
          </Text>
        </View>
        <View className="gap-3 rounded-xl bg-card p-4">
          <Text accessibilityRole="header" className="font-sans-extrabold text-h3">
            Looks
          </Text>
          <Text className="text-muted-foreground">Light, dark, or follow your device.</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Looks" className="gap-2">
            {CHOICES.map(({ value, label }) => {
              const checked = theme === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked }}
                  onPress={() => setTheme(value)}
                  className={cn(
                    "h-12 justify-center rounded-full border px-5",
                    checked ? "border-transparent bg-primary" : "border-border bg-background",
                  )}
                >
                  <Text className={cn("font-sans-bold", checked && "text-primary-foreground")}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View className="gap-3 rounded-xl bg-card p-4">
          <Text accessibilityRole="header" className="font-sans-extrabold text-h3">
            Done for now?
          </Text>
          <Text className="text-muted-foreground">
            You can sign back in with your family code, nickname and PIN.
          </Text>
          <Button
            size="lg"
            variant="outline"
            accessibilityLabel="Sign out"
            onPress={() => void signOut()}
          >
            <Text>Sign out</Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
