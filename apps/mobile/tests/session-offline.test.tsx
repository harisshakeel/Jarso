// The offline launch, end to end below the provider: the app's real supabase-js client (with the
// timed fetch from core), the real `findProfileRole`, and a fetch that rejects the way React
// Native's does with no network. Only the auth session plumbing is stubbed.
import { offlineCopy } from "@jarso/core/offline";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { userEvent } from "@testing-library/react-native";
import { Stack } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { AppState, type AppStateStatus, Text } from "react-native";
import { SessionProvider } from "@/features/auth";
import { supabase } from "@/lib/supabase/client";

// These tests are about being offline: the notice reads the phone's connection to pick its wording.
jest.mock("expo-network", () => ({
  getNetworkStateAsync: async () => ({ isConnected: false, isInternetReachable: false }),
}));
// The client is created on import, before this file's consts exist: the store lives in the factory.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

type Listener = (event: AuthChangeEvent, session: Session | null) => void;
const fetchMock = jest.fn();
const appStateHandlers: Array<(state: AppStateStatus) => void> = [];

beforeEach(() => {
  // The timed fetch logs each failed call; expected here.
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  fetchMock.mockReset().mockRejectedValue(new TypeError("Network request failed"));
  globalThis.fetch = fetchMock;
  const child = { user: { id: "child-1" }, access_token: "jwt" } as unknown as Session;
  jest.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((cb) => {
    queueMicrotask(() => (cb as Listener)("INITIAL_SESSION", child));
    return { data: { subscription: { id: "s", callback: cb, unsubscribe: jest.fn() } } } as never;
  });
  jest
    .spyOn(supabase.auth, "getClaims")
    .mockResolvedValue({ data: { claims: { sub: "child-1" } }, error: null } as never);
  jest.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    appStateHandlers.push(handler as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  appStateHandlers.length = 0;
});

const roleReply = (role: string) =>
  new Response(JSON.stringify({ role }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function renderApp() {
  return renderRouter(
    {
      _layout: () => (
        <SessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </SessionProvider>
      ),
      "(child)/_layout": require("../app/(child)/_layout"),
      "(child)/(tabs)/index": () => <Text>Child home</Text>,
      "(child)/(tabs)/history": () => <Text>History</Text>,
      "(child)/(tabs)/requests": () => <Text>Requests</Text>,
      "(child)/(tabs)/settings": () => <Text>Settings</Text>,
      "(auth)/sign-in": require("../app/(auth)/sign-in"),
      "(auth)/parents": require("../app/(auth)/parents"),
    },
    { initialUrl: "/" },
  );
}

describe("offline launch", () => {
  it("keeps the session, shows the offline copy and never the tabs", async () => {
    await renderApp();

    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.queryByText("Child home")).not.toBeOnTheScreen();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    // The PostgREST call went out through the timed fetch and came back as JA503.
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/rest/v1/profiles");
  });

  it("lets the child in on Retry once the network is back", async () => {
    await renderApp();
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();

    fetchMock.mockResolvedValue(roleReply("child"));
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Child home")).toBeOnTheScreen();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("re-checks when the app comes back to the foreground", async () => {
    await renderApp();
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();

    fetchMock.mockResolvedValue(roleReply("child"));
    await act(async () => {
      for (const handler of appStateHandlers) handler("active");
    });

    expect(await screen.findByText("Child home")).toBeOnTheScreen();
  });
});
