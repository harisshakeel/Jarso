import { usePushRegistration } from "./use-push-registration";

/** Push wiring for whoever is signed in. Mounted once, inside `SessionProvider`. */
export function PushBridge(): null {
  usePushRegistration();
  return null;
}
