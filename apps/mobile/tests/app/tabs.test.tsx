import { fetchUnreadCount } from "@jarso/data/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import TabsLayout from "../../app/(child)/(tabs)/_layout";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@jarso/data/notifications", () => ({ fetchUnreadCount: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
// Each screen renders as a line saying its title and whether it has a tab button.
jest.mock("expo-router/js-tabs", () => {
  const { Text, View } = require("react-native");
  const Tabs = ({ children }: { children: ReactNode }) => <View>{children}</View>;
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

function renderTabs(unread = 0) {
  (fetchUnreadCount as jest.Mock).mockResolvedValue(unread);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TabsLayout />
    </QueryClientProvider>,
  );
}

describe("child tabs", () => {
  it("are Home, Diary, Learn, Jarso and News, as on the web", async () => {
    guideState.mockResolvedValue({ available: true, introNeeded: false });
    await renderTabs();
    await waitFor(() => expect(screen.getByTestId("tab-jarso")).toHaveTextContent("Jarso"));
    expect(
      screen.getAllByText(/^(Home|Diary|Learn|Jarso|News)/).map((t) => t.props.children),
    ).toEqual(["Home", "Diary", "Learn", "Jarso", "News"]);
    expect(guideState).toHaveBeenCalledWith("/api/v1/guide/state", { auth: true });
  });

  it("tabs hide Jarso when guide off", async () => {
    guideState.mockResolvedValue({ available: false, introNeeded: false });
    await renderTabs();
    await waitFor(() => expect(guideState).toHaveBeenCalled());
    // Let the query settle (resolved or rejected) before asserting the tab stayed hidden.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("tab-jarso")).toHaveTextContent("Jarso (hidden)");
  });

  it("keeps Jarso hidden when the guide state can't be read", async () => {
    guideState.mockRejectedValue(new Error("down"));
    await renderTabs();
    await waitFor(() => expect(guideState).toHaveBeenCalled());
    // Let the query settle (resolved or rejected) before asserting the tab stayed hidden.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("tab-jarso")).toHaveTextContent("Jarso (hidden)");
  });

  it("badges News with the unread count", async () => {
    guideState.mockResolvedValue({ available: true, introNeeded: false });
    await renderTabs(3);
    await waitFor(() => expect(screen.getByTestId("tab-news")).toHaveTextContent("News 3"));
  });
});
