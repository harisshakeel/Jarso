import type { ConfigContext, ExpoConfig } from "expo/config";

// Wave 1 test builds call the web API on a LAN dev server over plain http, which Android
// blocks unless cleartext is allowed. Store builds (EAS profile "production") keep it off.
const allowCleartext = process.env.EAS_BUILD_PROFILE !== "production";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    ["expo-build-properties", { android: { usesCleartextTraffic: allowCleartext } }],
  ],
});
