import { type Href, Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { homeFor, saveSignInMode, useSession } from "@/features/auth";
import { AccountStep } from "./account-step";
import { HowItWorks } from "./how-it-works";
import type { SignUpOutcome } from "./sign-up";
import { VerifyStep } from "./verify-step";

type Phase =
  | { name: "how" }
  | { name: "account" }
  | { name: "verify"; email: string }
  | { name: "wait" };

/**
 * Steps 2 and 3 before there is a session: how Jarso works, the account, and the email code
 * when the project asks for one. Once a parent session exists (from `signUp` or the code) the
 * parent's setup takes over at "About you", keeping `next`.
 */
export function SignUpScreen({ next }: { next?: string }) {
  const router = useRouter();
  const { role, status } = useSession();
  const [phase, setPhase] = useState<Phase>({ name: "how" });
  const [email, setEmail] = useState("");

  if (role === "parent") {
    return <Redirect href={{ pathname: "/(parent)/setup", params: next ? { next } : {} }} />;
  }
  if (role === "child") return <Redirect href={homeFor("child")} />;
  // The (child) guard shows the offline notice while the role cannot be read.
  if (status === "unavailable") return <Redirect href={homeFor("child") as Href} />;

  const signIn = () => {
    void saveSignInMode("parent");
    router.replace({ pathname: "/sign-in", params: { mode: "parent", ...(next ? { next } : {}) } });
  };
  const signedUp = (outcome: SignUpOutcome, address: string) => {
    setEmail(address);
    setPhase(outcome === "verify" ? { name: "verify", email: address } : { name: "wait" });
  };

  switch (phase.name) {
    case "how":
      return <HowItWorks onDone={() => setPhase({ name: "account" })} />;
    case "account":
      return (
        <AccountStep
          initialEmail={email}
          onBack={() => setPhase({ name: "how" })}
          onSignedUp={signedUp}
          onSignIn={signIn}
        />
      );
    case "verify":
      return (
        <VerifyStep
          email={phase.email}
          onBack={() => setPhase({ name: "account" })}
          onSignIn={signIn}
        />
      );
    case "wait":
      // Signed up with a session: the session provider is reading the new parent's role.
      return (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator accessibilityLabel="Loading" />
        </View>
      );
  }
}
