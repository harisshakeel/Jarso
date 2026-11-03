import { fetchUnreadCount } from "@jarso/data/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import ParentTabsLayout from "../../app/(parent)/(tabs)/_layout";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@jarso/data/notifications", () => ({ fetchUnreadCount: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
// Each screen renders as a line saying its title and whether it has a tab button; the shared
// header's right side renders once, above them.
jest.mock("expo-router/js-tabs", () => {
  const { Text, View } = require("react-native");
  const Tabs = ({
    children,
    screenOptions,
  }: {
    children: ReactNode;
    screenOptions: { headerRight?: () => ReactNode };
  }) => (
    <View>
      {screenOptions.headerRight?.()}
      {children}
    </View>
  );
  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options: { title: string; href?: null; tabBarBadge?: number };
  }) => (
    <Text testID={`tab-${name}`}>
      {`${options.title}${options.href === null ? " (hidden)" : ""}${options.tabBarBadge ? ` ${options.tabBarBadge}` : ""}`}
    </Text>
  );
  return { Tabs };
});

const guideState = apiFetch as jest.Mock;
const push = jest.fn();

function renderTabs(unread = 0) {
  (fetchUnreadCount as jest.Mock).mockResolvedValue(unread);
  (useRouter as jest.Mock).mockReturnValue({ push });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ParentTabsLayout />
    </QueryClientProvider>,
  );
}

/** Let the guide state query settle (resolved or rejected). */
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });

beforeEach(() => jest.clearAllMocks());

describe("parent tabs", () => {
  it("are Family, Children, Jarso and Inbox", async () => {
    guideState.mockResolvedValue({ configured: true, enabledChildIds: [] });
    await renderTabs();
    await waitFor(() => expect(screen.getByTestId("tab-jarso")).toHaveTextContent(/^Jarso$/));
    expect(
      screen.getAllByText(/^(Family|Children|Jarso|Inbox)/).map((t) => t.props.children),
    ).toEqual(["Family", "Children", "Jarso", "Inbox"]);
    expect(guideState).toHaveBeenCalledWith("/api/v1/guide/state", { auth: true });
  });

  it("parent tabs hide Jarso when not configured", async () => {
    guideState.mockResolvedValue({ configured: false, enabledChildIds: [] });
    await renderTabs();
    await waitFor(() => expect(guideState).toHaveBeenCalled());
    await settle();
    expect(screen.getByTestId("tab-jarso")).toHaveTextContent("Jarso (hidden)");
  });

  it("keeps Jarso hidden when the guide state can't be read", async () => {
    guideState.mockRejectedValue(new Error("down"));
    await renderTabs();
    await waitFor(() => expect(guideState).toHaveBeenCalled());
    await settle();
    expect(screen.getByTestId("tab-jarso")).toHaveTextContent("Jarso (hidden)");
  });

  it("inbox badge shows unread", async () => {
    guideState.mockResolvedValue({ configured: false, enabledChildIds: [] });
    await renderTabs(4);
    await waitFor(() => expect(screen.getByTestId("tab-inbox")).toHaveTextContent("Inbox 4"));
  });

  it("opens Settings from the header button", async () => {
    guideState.mockResolvedValue({ configured: false, enabledChildIds: [] });
    const user = userEvent.setup();
    await renderTabs();
    await user.press(screen.getByRole("button", { name: "Settings" }));
    expect(push).toHaveBeenCalledWith("/(parent)/settings");
  });
});
