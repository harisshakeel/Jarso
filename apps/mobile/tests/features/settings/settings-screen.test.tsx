import { findNickname } from "@jarso/data/family";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";
import { loadTheme, SettingsScreen, THEME_KEY } from "@/features/settings";

const mockSignOut = jest.fn();
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1", signOut: mockSignOut }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@jarso/data/family", () => ({ findNickname: jest.fn() }));
jest.mock("nativewind", () => ({
  ...jest.requireActual("nativewind"),
  colorScheme: { set: jest.fn() },
}));

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  (findNickname as jest.Mock).mockReset().mockResolvedValue(null);
  mockStore.clear();
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
});

describe("SettingsScreen", () => {
  it("offers Light, Dark and Same as my phone, with system chosen by default", async () => {
    await renderSettings();
    expect(
      await screen.findByRole("radio", { name: "Same as my phone", checked: true }),
    ).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Light", checked: false })).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Dark", checked: false })).toBeOnTheScreen();
  });

  it("shows the stored choice", async () => {
    mockStore.set(THEME_KEY, "dark");
    await renderSettings();
    expect(await screen.findByRole("radio", { name: "Dark", checked: true })).toBeOnTheScreen();
  });

  it("applies and stores a choice under 'theme'", async () => {
    await renderSettings();
    await userEvent.setup().press(await screen.findByRole("radio", { name: "Dark" }));

    expect(colorScheme.set).toHaveBeenCalledWith("dark");
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith("theme", "dark"));
    expect(screen.getByRole("radio", { name: "Dark", checked: true })).toBeOnTheScreen();
  });

  it("explains how to sign back in and signs out", async () => {
    await renderSettings();
    expect(
      screen.getByText("You can sign back in with your family code, nickname and PIN."),
    ).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByLabelText("Sign out")));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsScreen nickname", () => {
  it("says which nickname the child signs in as", async () => {
    (findNickname as jest.Mock).mockResolvedValue("Maya");
    await renderSettings();
    expect(
      await screen.findByText("You sign in as Maya. A parent can change your nickname or PIN."),
    ).toBeOnTheScreen();
  });

  it.each([
    ["no nickname", () => (findNickname as jest.Mock).mockResolvedValue(null)],
    ["a failed read", () => (findNickname as jest.Mock).mockRejectedValue(new Error("down"))],
  ])("uses the fallback line for %s", async (_name, arrange) => {
    arrange();
    await renderSettings();
    expect(
      await screen.findByText(
        "Your nickname is how you sign in. A parent can change your nickname or PIN.",
      ),
    ).toBeOnTheScreen();
  });
});

describe("loadTheme", () => {
  it("reads a stored choice", async () => {
    mockStore.set(THEME_KEY, "light");
    expect(await loadTheme()).toBe("light");
  });

  it.each([[undefined], ["purple"]])("falls back to system for %s", async (value) => {
    if (value) mockStore.set(THEME_KEY, value);
    expect(await loadTheme()).toBe("system");
  });

  it("falls back to system when the store fails", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error("locked"));
    expect(await loadTheme()).toBe("system");
  });
});
