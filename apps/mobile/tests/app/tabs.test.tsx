import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import TabsLayout from "../../app/(child)/(tabs)/_layout";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
// Each screen renders as a line saying its title and whether it is hidden; a custom tab button renders too.
jest.mock("expo-router/js-tabs", () => {
  const { Text, View } = require("react-native");
  const Tabs = ({ children }: { children: ReactNode }) => <View>{children}</View>;
  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options: { title: string; href?: null; tabBarButton?: () => ReactNode };
  }) => (
    <View>
      <Text testID={`tab-${name}`}>
        {`${options.title}${options.href === null ? " (hidden)" : ""}`}
      </Text>
      {options.tabBarButton?.()}
    </View>
  );
  return { Tabs };
});

const guideState = apiFetch as jest.Mock;

function renderTabs() {
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
  it("are Home, Learn, +, Diary and Jarso", async () => {
    guideState.mockResolvedValue({ available: true, introNeeded: false });
    await renderTabs();
    await waitFor(() => expect(screen.getByTestId("tab-jarso")).toHaveTextContent("Jarso"));
    expect(screen.getAllByTestId(/^tab-/).map((t) => t.props.testID)).toEqual([
      "tab-index",
      "tab-learn",
      "tab-plus",
      "tab-diary",
      "tab-jarso",
    ]);
    expect(guideState).toHaveBeenCalledWith("/api/v1/guide/state", { auth: true });
  });

  it("the + button opens What happened?", async () => {
    guideState.mockResolvedValue({ available: true, introNeeded: false });
    await renderTabs();
    fireEvent.press(screen.getByRole("button", { name: "What happened?" }));
    expect(mockPush).toHaveBeenCalledWith("/(child)/add");
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
});
