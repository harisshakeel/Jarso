import type { ConfigContext, ExpoConfig } from "expo/config";
import { type ConfigPlugin, withProjectBuildGradle } from "expo/config-plugins";

// stripe-react-native compiles against stripe-android-issuing-push-provisioning, whose runtime
// dependency play-services-tapandpay is not on any public Maven repo. Release lint resolves it
// and fails the build. Jarso does not use card push provisioning, so drop it everywhere.
const TAPANDPAY_EXCLUDE = `
allprojects {
  configurations.configureEach {
    exclude group: "com.google.android.gms", module: "play-services-tapandpay"
  }
}
`;

/** Appends the tapandpay exclude to the root build.gradle (Groovy), at most once. */
export function excludeTapAndPay(gradle: string): string {
  return gradle.includes("play-services-tapandpay") ? gradle : gradle + TAPANDPAY_EXCLUDE;
}

const withoutTapAndPay: ConfigPlugin = (config) =>
  withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = excludeTapAndPay(mod.modResults.contents);
    return mod;
  });

// Build-time config only: nothing read here reaches the app bundle except through `config`.
export default ({ config }: ConfigContext): ExpoConfig => {
  // Wave 1 test builds call the web API on a LAN dev server over plain http, which Android
  // blocks unless cleartext is allowed. Store builds (EAS profile "production") keep it off.
  const allowCleartext = process.env.EAS_BUILD_PROFILE !== "production";
  // google-services.json is never in the repo: EAS supplies it as the file env var
  // GOOGLE_SERVICES_JSON (docs/mobile.md). Without it the build still works, it just gets
  // no push token.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const base = config as ExpoConfig;

  return withoutTapAndPay({
    ...base,
    android: {
      ...base.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: [
      ...(base.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: allowCleartext } }],
    ],
  });
};
