import { findProfileRole } from "@jarso/data/family";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { MutationObserver } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import { registerBeforeSignOut, SessionProvider, useSession } from "@/features/auth";
import { AppError } from "@/lib";
import { queryClient } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

type Listener = (event: AuthChangeEvent, session: Session | null) => void;
let listener: Listener | undefined;
let initial: Session | null = null;

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getClaims: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
// The outbox's sync has its own tests (tests/lib/outbox); here only the gate is under test.
jest.mock("@/lib/outbox", () => ({ OutboxSync: () => null }));
// The live notices need Realtime and the query client; not under test here.
jest.mock("@/features/news", () => ({
  NoticeListener: () => null,
  useUnreadCount: () => ({ data: undefined }),
}));
jest.mock("@jarso/data/family", () => ({ findProfileRole: jest.fn() }));

const auth = supabase.auth as unknown as {
  onAuthStateChange: jest.Mock;
  getClaims: jest.Mock;
  signOut: jest.Mock;
};
const role = findProfileRole as jest.Mock;

let current: Session | null = null;
const session = (id: string) => ({ user: { id }, access_token: "jwt" }) as unknown as Session;

/** Fire an auth event the way supabase-js does: outside React. */
async function emit(event: AuthChangeEvent, next: Session | null) {
  current = next;
  await act(async () => listener?.(event, next));
}

beforeEach(() => {
  initial = null;
  listener = undefined;
  role.mockReset();
  current = null;
  auth.getClaims.mockReset().mockImplementation(async () => ({
    data: current ? { claims: { sub: current.user.id } } : null,
    error: null,
  }));
  auth.onAuthStateChange.mockReset().mockImplementation((cb: Listener) => {
    listener = cb;
    current = initial;
    // supabase-js reports the stored session as INITIAL_SESSION right after subscribing.
    queueMicrotask(() => cb("INITIAL_SESSION", initial));
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  auth.signOut.mockReset().mockImplementation(async () => {
    current = null;
    listener?.("SIGNED_OUT", null);
    return { error: null };
  });
});

function Root() {
  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionProvider>
  );
}

function SettingsStub() {
  const { signOut } = useSession();
  return (
    <Text accessibilityRole="button" onPress={() => void signOut()}>
      Sign out
    </Text>
  );
}

function renderApp(initialUrl = "/") {
  return renderRouter(
    {
      _layout: Root,
      "(child)/_layout": require("../app/(child)/_layout"),
      "(child)/(tabs)/index": () => <Text>Child home</Text>,
      "(child)/(tabs)/diary": () => <Text>Diary</Text>,
      "(child)/requests": () => <Text>Requests</Text>,
      "(child)/me": SettingsStub,
      "(auth)/sign-in": require("../app/(auth)/sign-in"),
      "(parent)/(tabs)/index": () => <Text>Family home</Text>,
    },
    { initialUrl },
  );
}

function SessionProbe() {
  const { status, role, userId } = useSession();
  return <Text>{`${status}:${role ?? "-"}:${userId ?? "-"}`}</Text>;
}

describe("session and role gate", () => {
  it("lets a child session reach the child tabs", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");

    await renderApp();

    expect(await screen.findByText("Child home")).toBeOnTheScreen();
    expect(screen).toHavePathname("/");
    expect(role).toHaveBeenCalledWith(supabase, "child-1");
  });

  it("sends a signed-out phone to the PIN screen with no notice", async () => {
    await renderApp();

    expect(await screen.findByLabelText("Your PIN")).toBeOnTheScreen();
    expect(screen).toHavePathname("/sign-in");
    expect(screen.queryByText("Please sign in again.")).not.toBeOnTheScreen();
    expect(screen.queryByText("Child home")).not.toBeOnTheScreen();
  });

  it("parent session sets status parent with userId", async () => {
    initial = session("parent-1");
    role.mockResolvedValue("parent");

    await renderRouter(
      {
        _layout: Root,
        index: SessionProbe,
      },
      { initialUrl: "/" },
    );

    expect(await screen.findByText("parent:parent:parent-1")).toBeOnTheScreen();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("keeps a parent signed in and shows no child screen", async () => {
    initial = session("parent-1");
    role.mockResolvedValue("parent");

    await renderApp("/diary");

    expect(await screen.findByText("Family home")).toBeOnTheScreen();
    expect(screen.queryByText("Diary")).not.toBeOnTheScreen();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signed-in parent visiting sign-in redirects to parent tabs", async () => {
    initial = session("parent-1");
    role.mockResolvedValue("parent");

    await renderApp("/sign-in");

    expect(await screen.findByText("Family home")).toBeOnTheScreen();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("goes to a safe next path after sign-in", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");

    await renderApp("/sign-in?next=%2Frequests");

    expect(await screen.findByText("Requests")).toBeOnTheScreen();
    expect(screen).toHavePathname("/requests");
  });

  it("ignores an unsafe next path", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");

    await renderApp("/sign-in?next=https%3A%2F%2Fevil.example");

    expect(await screen.findByText("Child home")).toBeOnTheScreen();
  });

  it("runs the before-sign-out hooks before the session goes", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");
    const order: string[] = [];
    const unregister = registerBeforeSignOut(async () => {
      order.push(auth.signOut.mock.calls.length === 0 ? "hook-first" : "hook-late");
    });
    await renderApp();
    expect(await screen.findByText("Child home")).toBeOnTheScreen();
    await act(async () => router.navigate("/me"));

    await act(async () => (await screen.findByText("Sign out")).props.onPress());

    expect(await screen.findByLabelText("Your PIN")).toBeOnTheScreen();
    expect(order).toEqual(["hook-first"]);
    unregister();
  });

  it("signs out when the role read fails for a reason other than the network", async () => {
    initial = session("child-1");
    role.mockRejectedValue(new AppError("INTERNAL", "Something went wrong. Please try again."));

    await renderApp();

    expect(await screen.findByLabelText("Your PIN")).toBeOnTheScreen();
    expect(auth.signOut).toHaveBeenCalled();
    expect(screen.queryByText("Child home")).not.toBeOnTheScreen();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeOnTheScreen();
  });

  it.each([["TOKEN_REFRESHED"], ["SIGNED_OUT"]] as const)(
    "signs out to the PIN screen when refresh fails (%s)",
    async (event) => {
      initial = session("child-1");
      role.mockResolvedValue("child");
      await renderApp();
      expect(await screen.findByText("Child home")).toBeOnTheScreen();

      await emit(event, null);

      expect(await screen.findByText("Please sign in again.")).toBeOnTheScreen();
      expect(screen).toHavePathname("/sign-in");
      expect(screen.queryByText("Child home")).not.toBeOnTheScreen();
    },
  );

  it("shows no notice after the child signs out on purpose", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");
    await renderApp();
    expect(await screen.findByText("Child home")).toBeOnTheScreen();
    await act(async () => router.navigate("/me"));

    await act(async () => (await screen.findByText("Sign out")).props.onPress());

    expect(await screen.findByLabelText("Your PIN")).toBeOnTheScreen();
    expect(screen.queryByText("Please sign in again.")).not.toBeOnTheScreen();
  });

  it("clears the phone's session and signs out even when the revoke call rejects", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");
    await renderApp();
    expect(await screen.findByText("Child home")).toBeOnTheScreen();
    await act(async () => router.navigate("/me"));
    auth.signOut.mockReset().mockRejectedValue(new Error("network down"));

    await act(async () => (await screen.findByText("Sign out")).props.onPress());

    expect(await screen.findByLabelText("Your PIN")).toBeOnTheScreen();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not re-check the role on a token refresh for the same child", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");
    await renderApp();
    expect(await screen.findByText("Child home")).toBeOnTheScreen();

    await emit("TOKEN_REFRESHED", session("child-1"));

    expect(role).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Child home")).toBeOnTheScreen();
  });

  it("gates on the verified claims' user id, not the stored session's", async () => {
    initial = session("stored-id");
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "child-1" } }, error: null });
    role.mockResolvedValue("child");

    await renderApp();

    expect(await screen.findByText("Child home")).toBeOnTheScreen();
    expect(role).toHaveBeenCalledWith(supabase, "child-1");
  });

  it("signs out when the token can't be verified", async () => {
    initial = session("child-1");
    auth.getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") });

    await renderApp();

    expect(await screen.findByText("Please sign in again.")).toBeOnTheScreen();
    expect(auth.signOut).toHaveBeenCalled();
    expect(role).not.toHaveBeenCalled();
  });

  it("a refused session in a data query signs out to the PIN screen", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");
    await renderApp();
    expect(await screen.findByText("Child home")).toBeOnTheScreen();

    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ["home", "child-1"],
          queryFn: () => Promise.reject(new AppError("UNAUTHORIZED", "Please sign in again.")),
        })
        .catch(() => undefined);
    });

    expect(await screen.findByText("Please sign in again.")).toBeOnTheScreen();
    expect(screen).toHavePathname("/sign-in");
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("a refused session in a mutation signs out too, other errors do not", async () => {
    initial = session("child-1");
    role.mockResolvedValue("child");
    await renderApp();
    expect(await screen.findByText("Child home")).toBeOnTheScreen();

    const run = (error: AppError) =>
      act(async () => {
        await new MutationObserver(queryClient, { mutationFn: () => Promise.reject(error) })
          .mutate()
          .catch(() => undefined);
      });

    await run(new AppError("CONFLICT", "That already exists."));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.getByText("Child home")).toBeOnTheScreen();

    await run(new AppError("UNAUTHORIZED", "Please sign in again."));
    expect(await screen.findByText("Please sign in again.")).toBeOnTheScreen();
    expect(auth.signOut).toHaveBeenCalled();
  });
});
