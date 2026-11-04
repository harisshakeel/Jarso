import { useEffect, useRef } from "react";
import { useSession } from "@/features/auth";
import { installForegroundHandler } from "./foreground";
import { usePushRegistration } from "./use-push-registration";
import { usePushTaps } from "./use-push-taps";

/**
 * Push wiring for whoever is signed in: registration, taps, and how a push shows while the app
 * is open. Mounted once, inside `SessionProvider` and the query client.
 */
export function PushBridge(): null {
  const { userId } = useSession();
  const userRef = useRef(userId);
  useEffect(() => {
    userRef.current = userId;
  }, [userId]);

  useEffect(() => installForegroundHandler(() => userRef.current), []);
  usePushRegistration();
  usePushTaps();
  return null;
}
