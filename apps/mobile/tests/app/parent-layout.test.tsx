import { Stack, useLocalSearchParams } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";
import { useBodySizeClass } from "@/components/ui";

type MockSession = { status: string; role?: "child" | "parent"; userId?: string };
let mockSession: MockSession = { status: "signed-out" };

jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ ...mockSession, retry: jest.fn(), signOut: jest.fn() }),
}));
// The live notices need Realtime and the query client; not under test here.
jest.mock("@/features/news", () => ({ NoticeListener: () => null }));
jest.mock("@/lib/outbox", () => ({ OutboxSync: () => null }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

function Root() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

/** The parent's Family tab: says its body size, so the provider is under test too. */
function FamilyStub() {
  return <Text>{`Family home ${useBodySizeClass()}`}</Text>;
}

function SignInStub() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  return <Text>{`Sign in next=${next ?? "-"}`}</Text>;
}

function renderApp(initialUrl: string) {
  return renderRouter(
    {
      _layout: Root,
      "(child)/_layout": require("../../app/(child)/_layout"),
      "(child)/(tabs)/_layout": Root,
      "(child)/(tabs)/index": () => <Text>Child home</Text>,
      "(child)/(tabs)/diary": () => <Text>Diary</Text>,
      "(parent)/_layout": require("../../app/(parent)/_layout"),
      "(parent)/(tabs)/_layout": Root,
      "(parent)/(tabs)/index": FamilyStub,
      "(parent)/(tabs)/children": () => <Text>Children</Text>,
      "(parent)/(tabs)/inbox": () => <Text>Inbox</Text>,
      "(parent)/settings": () => <Text>Settings</Text>,
      "(auth)/sign-in": SignInStub,
    },
    { initialUrl },
  );
}

describe("role guards", () => {
  it("parent at child group redirects to parent tabs", async () => {
    mockSession = { status: "parent", role: "parent", userId: "parent-1" };
    await renderApp("/diary");
    expect(await screen.findByText(/^Family home/)).toBeOnTheScreen();
    expect(screen.queryByText("Diary")).not.toBeOnTheScreen();
  });

  it("child at parent route redirects to child home", async () => {
    mockSession = { status: "child", role: "child", userId: "child-1" };
    await renderApp("/children");
    expect(await screen.findByText("Child home")).toBeOnTheScreen();
    expect(screen.queryByText("Children")).not.toBeOnTheScreen();
  });

  it("signed out at parent route goes to sign-in with next", async () => {
    mockSession = { status: "signed-out" };
    await renderApp("/inbox");
    expect(await screen.findByText("Sign in next=/inbox")).toBeOnTheScreen();
    expect(screen).toHavePathname("/sign-in");
  });

  it("shows the offline notice while the role can't be read", async () => {
    mockSession = { status: "unavailable", userId: "parent-1" };
    await renderApp("/inbox");
    expect(await screen.findByLabelText("Try again")).toBeOnTheScreen();
    expect(screen.queryByText("Inbox")).not.toBeOnTheScreen();
  });

  it("lets a parent reach a parent page", async () => {
    mockSession = { status: "parent", role: "parent", userId: "parent-1" };
    await renderApp("/settings");
    expect(await screen.findByText("Settings")).toBeOnTheScreen();
  });

  it("wraps the parent stack in the parent body size", async () => {
    mockSession = { status: "parent", role: "parent", userId: "parent-1" };
    await renderApp("/diary");
    expect(await screen.findByText("Family home text-body-parent")).toBeOnTheScreen();
  });
});
