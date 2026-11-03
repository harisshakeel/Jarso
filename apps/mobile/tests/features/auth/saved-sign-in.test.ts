import { forgetSignIn, loadSavedSignIn, saveSignIn } from "@/features/auth/saved-sign-in";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

const details = { familyCode: "AB12CD", nickname: "Sam", pin: "1234" };

beforeEach(() => mockStore.clear());

describe("saved sign-in", () => {
  it("is empty until something is saved", async () => {
    expect(await loadSavedSignIn()).toBeNull();
  });

  it("round-trips the details and forgets them", async () => {
    await saveSignIn(details);
    expect(await loadSavedSignIn()).toEqual(details);
    await forgetSignIn();
    expect(await loadSavedSignIn()).toBeNull();
  });

  it("drops a value that is not valid sign-in details", async () => {
    mockStore.set("jarso.saved-sign-in", "{not json");
    expect(await loadSavedSignIn()).toBeNull();
    expect(mockStore.size).toBe(0);

    mockStore.set("jarso.saved-sign-in", JSON.stringify({ ...details, pin: "12" }));
    expect(await loadSavedSignIn()).toBeNull();
    expect(mockStore.size).toBe(0);
  });
});
