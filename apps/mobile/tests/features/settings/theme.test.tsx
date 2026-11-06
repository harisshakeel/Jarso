import { act, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { Appearance } from "react-native";
import { loadTheme, setTheme, THEME_KEY } from "@/features/settings";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe("loadTheme", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([["light"], ["dark"]])("reads a stored %s", async (value) => {
    mockStore.set(THEME_KEY, value);
    expect(await loadTheme()).toBe(value);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", undefined, "dark"],
    ["an old 'system'", "system", "dark"],
    ["something unknown", "purple", "light"],
  ] as const)(
    "with %s stored, uses the phone's scheme and saves it at once",
    async (_name, stored, phone) => {
      if (stored) mockStore.set(THEME_KEY, stored);
      jest.spyOn(Appearance, "getColorScheme").mockReturnValue(phone);
      expect(await loadTheme()).toBe(phone);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(THEME_KEY, phone);
    },
  );

  it("with no phone scheme, starts light", async () => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue(null);
    expect(await loadTheme()).toBe("light");
    expect(mockStore.get(THEME_KEY)).toBe("light");
  });

  it("uses the phone's scheme without saving when the store can't be read", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error("locked"));
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    expect(await loadTheme()).toBe("dark");
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("keeps a flip made while the stored choice is being read", async () => {
    let finishRead: (value: string | null) => void = () => {};
    (SecureStore.getItemAsync as jest.Mock).mockImplementationOnce(
      () => new Promise<string | null>((resolve) => (finishRead = resolve)),
    );
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    const loading = loadTheme();
    await act(() => setTheme("light"));
    finishRead(null);
    expect(await loading).toBe("light");
    expect(mockStore.get(THEME_KEY)).toBe("light");
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(THEME_KEY, "dark");
  });

  it("keeps a flip made while the phone's scheme is being saved", async () => {
    let finishSave: () => void = () => {};
    (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(
      (key: string, value: string) =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            mockStore.set(key, value);
            resolve();
          };
        }),
    );
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    const loading = loadTheme();
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalledWith(THEME_KEY, "dark"));
    const flipping = act(() => setTheme("light"));
    finishSave();
    await flipping;
    expect(await loading).toBe("light");
    expect(mockStore.get(THEME_KEY)).toBe("light");
  });
});
