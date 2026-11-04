import { offlineCopy } from "@jarso/core/offline";
import { findProfileRole } from "@jarso/data/family";
import { type Session as AuthSession, isAuthRetryableFetchError } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { isAppError, logger, SIGN_IN_AGAIN, toUserMessage } from "@/lib";
import { queryClient, setUnauthorizedHandler } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";
import { runBeforeSignOut } from "./before-sign-out";
import type { Role } from "./role-home";

type SessionState =
  | { status: "loading" }
  | { status: "signed-out"; notice?: string }
  /** The role could not be read (no network, timeout). The session is kept; nothing is shown. */
  | { status: "unavailable"; notice: string }
  | { status: Role; userId: string };

export type SessionStatus = SessionState["status"];

export type SessionValue = {
  status: SessionStatus;
  /** Set with `userId` once the role is read. */
  role?: Role;
  userId?: string;
  /** Why the user is not in: the session ended, the role read failed, or Jarso is unreachable. */
  notice?: string;
  signOut(): Promise<void>;
  /** Re-runs the role check after `unavailable`. */
  retry(): void;
};

export const SessionContext = createContext<SessionValue | null>(null);

/** What the gate decided for the session it was asked about. */
type Verdict =
  | { kind: Role; userId: string }
  | { kind: "unavailable" }
  | { kind: "refused"; notice: string };

const isTransportFailure = (error: unknown) =>
  (isAppError(error) && error.code === "UNAVAILABLE") || isAuthRetryableFetchError(error);

/**
 * The verified user id comes from `getClaims()` (the token checked against Supabase), not the
 * stored session object. A missing profile reads as `parent` (the web's rule); setup follows.
 */
async function verify(): Promise<Verdict> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) throw error;
    const userId = data?.claims.sub;
    if (!userId) return { kind: "refused", notice: SIGN_IN_AGAIN };
    const role = await findProfileRole(supabase, userId);
    return { kind: role, userId };
  } catch (error) {
    if (isTransportFailure(error)) return { kind: "unavailable" };
    logger.warn("Session check failed", { code: isAppError(error) ? error.code : undefined });
    return { kind: "refused", notice: isAppError(error) ? toUserMessage(error) : SIGN_IN_AGAIN };
  }
}

/**
 * Owns the phone's auth state.
 * - A session counts only once its verified user's `profiles.role` is read: `child` or `parent`.
 * - No network or a timeout keeps the session and shows `unavailable` (offline copy, Retry);
 *   it re-checks on Retry and when the app comes back to the foreground.
 * - Any other failure signs out to the sign-in screen with a safe message.
 * - Every sign-out first runs the `registerBeforeSignOut` hooks (each capped at 5 s).
 * - Losing the session without asking (a failed refresh, a revoked token reported by a data
 *   call) lands on the PIN screen with the web's sign-in-again line.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  // The stored session's user while we hold or check it. Refs: auth events arrive outside React.
  const userRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const checkingRef = useRef<string | null>(null);

  const endSession = useCallback(async () => {
    leavingRef.current = true;
    try {
      await runBeforeSignOut();
      const { error } = await supabase.auth.signOut();
      // The stored session goes even when the revoke call fails (same rule as the web).
      if (error) {
        logger.warn("Sign-out revoke failed; clearing the phone's session", { code: error.code });
        await supabase.auth.signOut({ scope: "local" });
      }
    } catch (error) {
      logger.warn("Sign-out failed; clearing the phone's session", { error });
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    } finally {
      leavingRef.current = false;
      userRef.current = null;
      queryClient.clear();
    }
  }, []);

  const check = useCallback(
    async (sessionUser: string) => {
      if (checkingRef.current === sessionUser) return; // already checking this user
      checkingRef.current = sessionUser;
      let verdict: Verdict;
      try {
        verdict = await verify();
      } finally {
        if (checkingRef.current === sessionUser) checkingRef.current = null;
      }
      if (userRef.current !== sessionUser) return; // a newer session took over, or it ended

      switch (verdict.kind) {
        case "child":
        case "parent":
          setState({ status: verdict.kind, userId: verdict.userId });
          return;
        case "unavailable":
          setState({ status: "unavailable", notice: offlineCopy.offline });
          return;
        case "refused":
          await endSession();
          setState({ status: "signed-out", notice: verdict.notice });
      }
    },
    [endSession],
  );

  const retry = useCallback(() => {
    const user = userRef.current;
    if (!user) return;
    setState({ status: "loading" });
    void check(user);
  }, [check]);

  useEffect(() => {
    const onChange = (session: AuthSession | null) => {
      const id = session?.user.id ?? null;
      if (!id) {
        const lost = userRef.current !== null && !leavingRef.current;
        userRef.current = null;
        if (lost) queryClient.clear();
        setState({ status: "signed-out", notice: lost ? SIGN_IN_AGAIN : undefined });
        return;
      }
      if (id === userRef.current) return; // a token refresh for the same user
      userRef.current = id;
      setState({ status: "loading" });
      // supabase-js holds its auth lock during this callback: query after it returns.
      setTimeout(() => void check(id), 0);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => onChange(session));
    return () => data.subscription.unsubscribe();
  }, [check]);

  // Back in the foreground after "unavailable": try again.
  useEffect(() => {
    if (state.status !== "unavailable") return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") retry();
    });
    return () => sub.remove();
  }, [state.status, retry]);

  // A data call refused the session (a revoked token): sign out to the PIN screen.
  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        if (userRef.current === null || leavingRef.current) return;
        void endSession().then(() => setState({ status: "signed-out", notice: SIGN_IN_AGAIN }));
      }),
    [endSession],
  );

  const signOut = useCallback(async () => {
    await endSession();
    setState({ status: "signed-out" });
  }, [endSession]);

  const value = useMemo<SessionValue>(
    () => ({
      status: state.status,
      role: state.status === "child" || state.status === "parent" ? state.status : undefined,
      userId: state.status === "child" || state.status === "parent" ? state.userId : undefined,
      notice:
        state.status === "signed-out" || state.status === "unavailable" ? state.notice : undefined,
      signOut,
      retry,
    }),
    [state, signOut, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
