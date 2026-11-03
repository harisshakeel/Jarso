import { parseEnv } from "@/config/env";

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-placeholder",
  EXPO_PUBLIC_API_URL: "http://192.168.1.10:3000",
};

describe("parseEnv", () => {
  it("returns the three public settings", () => {
    expect(parseEnv(valid, true)).toEqual({
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "publishable-test-placeholder",
      apiUrl: "http://192.168.1.10:3000",
    });
  });

  it.each([
    "EXPO_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "EXPO_PUBLIC_API_URL",
  ] as const)("throws naming %s when it is missing", (name) => {
    expect(() => parseEnv({ ...valid, [name]: undefined }, true)).toThrow(name);
  });

  it.each(["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_API_URL"] as const)(
    "throws naming %s when it is not a URL",
    (name) => {
      expect(() => parseEnv({ ...valid, [name]: "not a url" }, true)).toThrow(name);
    },
  );

  it("refuses an http API URL unless insecure is allowed (dev builds)", () => {
    expect(() => parseEnv(valid)).toThrow("EXPO_PUBLIC_API_URL must use https");
    expect(parseEnv({ ...valid, EXPO_PUBLIC_API_URL: "https://api.example.com" }).apiUrl).toBe(
      "https://api.example.com",
    );
  });

  it("throws naming the key when it is empty", () => {
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }, true)).toThrow(
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });
});
