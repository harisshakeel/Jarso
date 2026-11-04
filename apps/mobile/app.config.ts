import type { ConfigContext, ExpoConfig } from "expo/config";

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

  return {
    ...base,
    android: {
      ...base.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: [
      ...(base.plugins ?? []),
      ["expo-build-properties", { android: { usesCleartextTraffic: allowCleartext } }],
    ],
  };
};
