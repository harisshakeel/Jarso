// Intl polyfills: already loaded by index.ts; kept first here so the layout never runs without them.
import "@/lib/intl";
import "@/lib/crypto";
import "../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/features/auth";
import { PushBridge } from "@/features/push";
import { useStoredTheme } from "@/features/settings";
import { brandFonts, logger, NAV_THEME } from "@/lib";
import { queryClient } from "@/lib/query";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  useStoredTheme();
  const [loaded, error] = useFonts(brandFonts);
  const scheme = colorScheme ?? "light";

  useEffect(() => {
    if (error) logger.warn("Brand fonts failed to load", { error });
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      {/* Edge to edge, the window no longer shrinks for the keyboard: forms follow it instead. */}
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            {/* Registers for push after sign-in, opens a tapped push. */}
            <PushBridge />
            <ThemeProvider value={NAV_THEME[scheme]}>
              <StatusBar style={scheme === "dark" ? "light" : "dark"} />
              <Stack screenOptions={{ headerShown: false }} />
              <PortalHost />
            </ThemeProvider>
          </SessionProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
