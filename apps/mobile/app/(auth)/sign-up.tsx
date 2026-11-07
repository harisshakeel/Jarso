import { useLocalSearchParams } from "expo-router";
import { SignUpScreen } from "@/features/setup";

/** Steps 2 and 3 of the parent's onboarding: how Jarso works, the account, the email code. */
export default function SignUp() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  return <SignUpScreen next={next} />;
}
