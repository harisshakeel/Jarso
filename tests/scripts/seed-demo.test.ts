import { describe, expect, it } from "vitest";
import {
  assertSeedableFamily,
  assertSeedTarget,
  isLocalUrl,
  parseSeedArgs,
  readSeedInput,
  readSeedTarget,
} from "../../scripts/seed-demo.mjs";

const input = {
  DEMO_PARENT_EMAIL: "Demo.Parent@Example.com",
  DEMO_PARENT_PASSWORD: "placeholder-password",
  DEMO_CHILD_PIN: "2468",
};

const target = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder",
  SUPABASE_SECRET_KEY: "secret-key-placeholder",
};

describe("parseSeedArgs", () => {
  it("defaults to no hosted run", () => {
    expect(parseSeedArgs([])).toEqual({ yesHosted: false, help: false });
  });

  it("reads --yes-hosted and --help", () => {
    expect(parseSeedArgs(["--yes-hosted", "-h"])).toEqual({ yesHosted: true, help: true });
  });

  it("refuses unknown options, including a password on the command line", () => {
    expect(() => parseSeedArgs(["--password=hunter22"])).toThrow(/Unknown option/);
    expect(() => parseSeedArgs(["--yes"])).toThrow(/Unknown option/);
  });
});

describe("host guard", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])(
    "treats %s as local",
    (url) => {
      expect(isLocalUrl(url)).toBe(true);
      expect(() => assertSeedTarget(url, false)).not.toThrow();
    },
  );

  it("refuses a hosted URL without --yes-hosted, naming only the host", () => {
    expect(() => assertSeedTarget("https://project.supabase.co", false)).toThrow(
      "Refusing to seed project.supabase.co: it isn't local. Pass --yes-hosted to seed it.",
    );
  });

  it("does not take a look-alike host for local", () => {
    expect(isLocalUrl("https://localhost.example.com")).toBe(false);
    expect(isLocalUrl("https://127.0.0.1.nip.io")).toBe(false);
  });

  it("allows a hosted URL with --yes-hosted", () => {
    expect(() => assertSeedTarget("https://project.supabase.co", true)).not.toThrow();
  });
});

describe("readSeedInput", () => {
  it("reads the parent and PIN, lower-casing the email", () => {
    expect(readSeedInput(input)).toEqual({
      email: "demo.parent@example.com",
      password: "placeholder-password",
      pin: "2468",
    });
  });

  it("names every missing variable", () => {
    expect(() => readSeedInput({})).toThrow(
      /DEMO_PARENT_EMAIL[\s\S]*DEMO_PARENT_PASSWORD is required[\s\S]*DEMO_CHILD_PIN is required/,
    );
  });

  it("never echoes a rejected value", () => {
    const run = () =>
      readSeedInput({ ...input, DEMO_PARENT_PASSWORD: "short", DEMO_CHILD_PIN: "12a4" });
    expect(run).toThrow(/at least 8 characters[\s\S]*4 to 6 numbers/);
    try {
      run();
    } catch (error) {
      expect(String(error)).not.toContain("short");
      expect(String(error)).not.toContain("12a4");
    }
  });
});

describe("readSeedTarget", () => {
  it("is null (the local stack) when no target variable is set", () => {
    expect(readSeedTarget({})).toBeNull();
    expect(readSeedTarget({ NEXT_PUBLIC_SUPABASE_URL: "  " })).toBeNull();
  });

  it("reads all three", () => {
    expect(readSeedTarget(target)).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "publishable-key-placeholder",
      secretKey: "secret-key-placeholder",
    });
  });

  it("refuses a partial set without echoing it", () => {
    const run = () => readSeedTarget({ NEXT_PUBLIC_SUPABASE_URL: target.NEXT_PUBLIC_SUPABASE_URL });
    expect(run).toThrow(/Set all of NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => readSeedTarget({ SUPABASE_SECRET_KEY: "secret-key-placeholder" })).toThrow(
      /or none to seed the local stack/,
    );
  });
});

describe("assertSeedableFamily", () => {
  it("allows a parent with no family (the seed creates a demo one)", () => {
    expect(() => assertSeedableFamily(null)).not.toThrow();
  });

  it("allows a family that is already a demo family", () => {
    expect(() => assertSeedableFamily({ demoClockEnabled: true })).not.toThrow();
  });

  it("refuses an existing family that is not a demo family", () => {
    expect(() => assertSeedableFamily({ demoClockEnabled: false })).toThrow(
      /already has a family that is not a demo family/,
    );
  });
});
