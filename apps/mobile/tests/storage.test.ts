import { CHUNK_BYTES, secureStorage } from "@/lib/supabase/storage";

// An in-memory Keychain/Keystore that enforces the per-value budget the adapter relies on.
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    if (new TextEncoder().encode(value).length > 1800) throw new Error("value too large");
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

const KEY = "sb-project-auth-token";

beforeEach(() => mockStore.clear());

describe("secureStorage", () => {
  it("chunks at 1800 bytes", () => {
    expect(CHUNK_BYTES).toBe(1800);
  });

  it("round-trips a 5 KB value through 1800-byte chunks", async () => {
    const value = JSON.stringify({
      access_token: "a".repeat(5 * 1024),
      user: { nickname: "Zoë 🐷" },
    });
    await secureStorage.setItem(KEY, value);

    expect(mockStore.get(`${KEY}.n`)).toBe("3");
    expect([...mockStore.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.1`, `${KEY}.2`, `${KEY}.n`]);
    expect(await secureStorage.getItem(KEY)).toBe(value);
  });

  it("never splits a multi-byte character across chunks", async () => {
    const value = "é".repeat(2000); // 4000 bytes
    await secureStorage.setItem(KEY, value);
    for (const [key, chunk] of mockStore) {
      if (key.endsWith(".n")) continue;
      expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(1800);
    }
    expect(await secureStorage.getItem(KEY)).toBe(value);
  });

  it("leaves no chunks after a remove", async () => {
    await secureStorage.setItem(KEY, "x".repeat(5 * 1024));
    await secureStorage.removeItem(KEY);
    expect(mockStore.size).toBe(0);
    expect(await secureStorage.getItem(KEY)).toBeNull();
  });

  it("still deletes every chunk when deleting the count fails", async () => {
    await secureStorage.setItem(KEY, "x".repeat(5 * 1024));
    const { deleteItemAsync } = jest.requireMock("expo-secure-store");
    deleteItemAsync.mockImplementationOnce(async () => {
      throw new Error("keychain busy");
    });

    await expect(secureStorage.removeItem(KEY)).rejects.toThrow("keychain busy");

    expect([...mockStore.keys()]).toEqual([`${KEY}.n`]);
  });

  it("drops the old tail when a shorter value replaces a longer one", async () => {
    await secureStorage.setItem(KEY, "x".repeat(5 * 1024));
    await secureStorage.setItem(KEY, "short");
    expect([...mockStore.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.n`]);
    expect(await secureStorage.getItem(KEY)).toBe("short");
  });

  it("returns null for a missing key or a missing chunk", async () => {
    expect(await secureStorage.getItem(KEY)).toBeNull();
    await secureStorage.setItem(KEY, "x".repeat(5 * 1024));
    mockStore.delete(`${KEY}.1`);
    expect(await secureStorage.getItem(KEY)).toBeNull();
  });
});
