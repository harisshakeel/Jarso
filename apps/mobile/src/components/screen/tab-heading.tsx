import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui";

/** A tab's page: its heading (the web's h1), then whatever the tab shows. */
export function TabHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
          {title}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
