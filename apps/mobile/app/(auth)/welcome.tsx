import { safeNextPath } from "@jarso/core/auth";
import { type Href, Redirect, useLocalSearchParams } from "expo-router";
import { homeFor, useSession } from "@/features/auth";
import { WelcomeScreen } from "@/features/setup";

/** Step 1 of the parent's onboarding and the front door of a new phone: parent or kid. */
export default function Welcome() {
  const { role } = useSession();
  const { next } = useLocalSearchParams<{ next?: string }>();
  if (role) return <Redirect href={safeNextPath(next, homeFor(role) as string) as Href} />;
  return <WelcomeScreen next={next} />;
}
