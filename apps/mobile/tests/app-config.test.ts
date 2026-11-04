import type { ConfigContext, ExpoConfig } from "expo/config";
import appJson from "../app.json";
import eas from "../eas.json";

type Plugin = string | [string, Record<string, unknown>];

function loadConfig(env: Record<string, string | undefined>): ExpoConfig {
  const saved = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    let config: ExpoConfig | undefined;
    jest.isolateModules(() => {
      const make = require("../app.config").default as (ctx: ConfigContext) => ExpoConfig;
      config = make({ config: appJson.expo } as unknown as ConfigContext);
    });
    return config as ExpoConfig;
  } finally {
    process.env = saved;
  }
}

function pluginNamed(plugins: Plugin[] | undefined, name: string): Plugin | undefined {
  return plugins?.find((p) => (Array.isArray(p) ? p[0] : p) === name);
}

describe("app config", () => {
  it("development profile is a dev-client apk", () => {
    const dev = (eas.build as Record<string, Record<string, unknown>>).development;
    expect(dev).toBeDefined();
    expect(dev?.developmentClient).toBe(true);
    expect(dev?.extends).toBe("base");
    expect(dev?.distribution).toBe("internal");
    expect(dev?.environment).toBe("development");
    expect((dev?.android as { buildType?: string } | undefined)?.buildType).toBe("apk");
  });

  it("notifications plugin and permission", () => {
    const plugins = appJson.expo.plugins as Plugin[];
    expect(pluginNamed(plugins, "expo-notifications")).toEqual([
      "expo-notifications",
      { color: "#02627d", defaultChannel: "notices" },
    ]);
    expect((appJson.expo.android as { permissions?: string[] }).permissions).toContain(
      "POST_NOTIFICATIONS",
    );
  });

  it("googleServicesFile comes only from the EAS file var", () => {
    expect(loadConfig({ GOOGLE_SERVICES_JSON: "/tmp/gs.json" }).android?.googleServicesFile).toBe(
      "/tmp/gs.json",
    );
    expect(loadConfig({ GOOGLE_SERVICES_JSON: undefined }).android?.googleServicesFile).toBe(
      undefined,
    );
  });

  it("keeps the app.json android settings", () => {
    const config = loadConfig({ GOOGLE_SERVICES_JSON: "/tmp/gs.json" });
    expect(config.android?.package).toBe("app.jarso.mobile");
    expect(config.android?.permissions).toContain("POST_NOTIFICATIONS");
  });

  it("cleartext stays off for production", () => {
    const build = (env: Record<string, string | undefined>) =>
      pluginNamed(loadConfig(env).plugins as Plugin[], "expo-build-properties") as [
        string,
        { android: { usesCleartextTraffic: boolean } },
      ];
    expect(build({ EAS_BUILD_PROFILE: "production" })[1].android.usesCleartextTraffic).toBe(false);
    expect(build({ EAS_BUILD_PROFILE: "development" })[1].android.usesCleartextTraffic).toBe(true);
  });

  it("tells R8 Stripe's push-provisioning classes are absent on purpose", () => {
    const [, options] = pluginNamed(
      loadConfig({}).plugins as Plugin[],
      "expo-build-properties",
    ) as [string, { android: { extraProguardRules?: string } }];
    expect(options.android.extraProguardRules).toContain(
      "-dontwarn com.stripe.android.pushProvisioning.**",
    );
  });

  it("excludes play-services-tapandpay from every Gradle configuration, once", () => {
    const { excludeTapAndPay } = require("../app.config") as {
      excludeTapAndPay: (gradle: string) => string;
    };
    const once = excludeTapAndPay("allprojects {}\n");
    expect(once).toContain(
      'exclude group: "com.google.android.gms", module: "play-services-tapandpay"',
    );
    expect(excludeTapAndPay(once)).toBe(once);
    // A mention of the module elsewhere (a comment, a partial exclusion) still gets the block.
    const mentioned = "// play-services-tapandpay is not on Maven\nallprojects {}\n";
    expect(excludeTapAndPay(mentioned)).toContain("configurations.configureEach");
    const withMods = loadConfig({}) as { mods?: { android?: { projectBuildGradle?: unknown } } };
    expect(withMods.mods?.android?.projectBuildGradle).toBeDefined();
  });
});
