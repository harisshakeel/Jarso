import { ScrollView } from "react-native";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";

/**
 * Settings. Placeholder so the header button resolves and a parent can sign out; Task 4 builds
 * the settings page.
 */
export default function ParentSettings() {
  const { signOut } = useSession();
  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pt-4 pb-10" className="bg-background">
      <Button variant="outline" accessibilityLabel="Sign out" onPress={() => void signOut()}>
        <Text>Sign out</Text>
      </Button>
    </ScrollView>
  );
}
