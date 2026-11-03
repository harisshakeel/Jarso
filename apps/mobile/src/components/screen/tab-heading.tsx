import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "./screen-header";

/** A tab's page: its heading (the web's h1), then whatever the tab shows. */
export function TabHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-4 px-4 pt-4 pb-10">
        <ScreenHeader title={title} />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
