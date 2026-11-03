import { useContext } from "react";
import { SessionContext, type SessionValue } from "./session-provider";

/** The phone's session: `child` only after `profiles.role` said so. */
export function useSession(): SessionValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
