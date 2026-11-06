import { useRouter } from "expo-router";
import { homeFor } from "@/features/auth";
import { OnboardingFlow } from "./onboarding-flow";

/** The intro again, opened from Me. Closes back to where it was opened. */
export function OnboardingScreen() {
  const router = useRouter();
  return (
    <OnboardingFlow
      onDone={() => (router.canGoBack() ? router.back() : router.replace(homeFor("child")))}
    />
  );
}
